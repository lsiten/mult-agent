"""
Organization Management Tools

This module provides tools for hierarchical agent collaboration:

- Task assignment from managers to subordinates
- Team member listing with workload statistics
- Task listing and tracking
- Progress and final reports from subordinates to managers
- Task approval workflow
- File sharing between managers and subordinates

**Permission Model (2-tier):**
1. Root Agent (me / user): Can assign tasks to ANY manager in the organization
2. Regular Managers: Can only assign tasks to their direct subordinates
"""

import json
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from tools.registry import registry

from gateway.org.store import (
    OrganizationStore,
    TaskRepository,
    TaskReportRepository,
    ApprovalRepository,
    AgentRepository,
)
from gateway.org.permissions import (
    require_management_permission,
    can_assign_to_agent,
    get_subordinates,
    PermissionError,
)

logger = logging.getLogger(__name__)


def _get_org_store() -> OrganizationStore:
    """Get the organization store instance."""
    return OrganizationStore()


def _get_agent_id_from_context(parent_agent: Any) -> int:
    """Extract the current agent's ID from parent agent context.

    This is a placeholder that will be refined when we integrate with
    the main agent system. For now, returns 0 (root) by default.
    """
    if hasattr(parent_agent, "agent_id"):
        return parent_agent.agent_id
    if hasattr(parent_agent, "profile_agent_id"):
        return parent_agent.profile_agent_id
    # Default: root agent
    return 0


# ============================================================
# 1. 任务分配工具（仅管理者可用）
# ============================================================

def assign_task_to_subordinate(
    subordinate_agent_id: int,
    title: str,
    description: str = "",
    priority: str = "normal",
    deadline: Optional[str] = None,
    parent_task_id: Optional[int] = None,
    parent_agent: Any = None,
) -> str:
    """
    [管理者专用] 给下属分配任务。

    **权限规则：**
    - 如果你是 Root Agent（我/用户）：只能给管理岗位的 Agent 分配任务
    - 如果你是普通管理者：只能给你的直属下属分配任务

    Args:
        subordinate_agent_id: 下属 Agent 的 ID
        title: 任务标题（简短明确）
        description: 任务详细描述，包括验收标准
        priority: 优先级 (low, normal, high, urgent)
        deadline: 截止时间，ISO 格式 (如: "2026-05-15T18:00:00")
        parent_task_id: 父任务 ID，用于拆分子任务
        parent_agent: 调用此工具的 Agent 上下文（自动注入）

    Returns:
        JSON 字符串包含任务详情或错误信息
    """
    try:
        store = _get_org_store()
        my_id = _get_agent_id_from_context(parent_agent)

        # 检查是否可以分配给目标 Agent
        can_assign, reason = can_assign_to_agent(store, my_id, subordinate_agent_id)
        if not can_assign:
            return json.dumps({"error": reason}, ensure_ascii=False)

        # 解析截止时间
        deadline_dt = None
        if deadline:
            try:
                deadline_dt = datetime.fromisoformat(deadline)
            except ValueError:
                return json.dumps({
                    "error": f"Invalid deadline format: {deadline}. Use ISO format: YYYY-MM-DDTHH:MM:SS"
                }, ensure_ascii=False)

        # 创建任务
        tasks = TaskRepository(store)
        task = store.transaction(lambda conn: tasks.create({
            "title": title,
            "description": description,
            "priority": priority,
            "creator_agent_id": my_id,
            "assignee_agent_id": subordinate_agent_id,
            "parent_task_id": parent_task_id,
            "deadline_at": deadline_dt,
        }, conn=conn))

        # 创建任务工作区
        try:
            agents = AgentRepository(store)
            subordinate = agents.get(subordinate_agent_id)
            if subordinate and subordinate.get("workspace_path"):
                task_workspace = Path(subordinate["workspace_path"]) / "tasks" / f"task-{task['id']}"
                task_workspace.mkdir(parents=True, exist_ok=True)
                tasks.update(task["id"], {"workspace_path": str(task_workspace)}, set())
                task["workspace_path"] = str(task_workspace)
        except Exception as e:
            logger.warning(f"Failed to create task workspace: {e}")

        return json.dumps(task, ensure_ascii=False, indent=2)

    except PermissionError as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)
    except Exception as e:
        logger.exception("Error assigning task")
        return json.dumps({"error": f"Failed to assign task: {e}"}, ensure_ascii=False)


# ============================================================
# 2. 查询下属列表（仅管理者可用）
# ============================================================

def list_my_subordinates(
    include_status: bool = True,
    parent_agent: Any = None,
) -> str:
    """
    [管理者专用] 查询我的所有直属下属及其当前工作负载。

    返回每个下属的：
    - 基本信息（姓名、职位）
    - 当前进行中的任务数量
    - 总任务数量

    Args:
        include_status: 是否包含任务统计信息
        parent_agent: 调用此工具的父 Agent（自动注入）

    Returns:
        JSON 字符串包含下属列表
    """
    try:
        store = _get_org_store()
        my_id = _get_agent_id_from_context(parent_agent)

        # 权限校验
        require_management_permission(store, my_id, "can_assign_tasks")

        subordinates = get_subordinates(store, my_id)

        # 补充任务统计
        if include_status:
            tasks = TaskRepository(store)
            for sub in subordinates:
                sub_tasks = tasks.list_by_assignee(sub["id"])
                in_progress = [t for t in sub_tasks if t["status"] == "in_progress"]
                sub["active_tasks_count"] = len(in_progress)
                sub["total_tasks_count"] = len(sub_tasks)

        return json.dumps(subordinates, ensure_ascii=False, indent=2)

    except PermissionError as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)
    except Exception as e:
        logger.exception("Error listing subordinates")
        return json.dumps({"error": f"Failed to list subordinates: {e}"}, ensure_ascii=False)


# ============================================================
# 3. 查询我收到的任务（所有 Agent 可用）
# ============================================================

def list_my_tasks(
    status: Optional[str] = None,
    parent_agent: Any = None,
) -> str:
    """
    [所有 Agent 可用] 查询分配给我的任务列表。

    Args:
        status: 按状态过滤 (pending, in_progress, review, completed, rejected)
                不传则返回所有状态
        parent_agent: 调用此工具的父 Agent（自动注入）

    Returns:
        JSON 字符串包含任务列表，每个任务包含最新汇报信息
    """
    try:
        store = _get_org_store()
        my_id = _get_agent_id_from_context(parent_agent)

        tasks = TaskRepository(store)
        my_tasks = tasks.list_by_assignee(my_id, status=status)

        # 补充最新汇报信息
        reports = TaskReportRepository(store)
        for task in my_tasks:
            task_reports = reports.list_by_task(task["id"])
            task["reports_count"] = len(task_reports)
            if task_reports:
                task["latest_report"] = task_reports[0]

        return json.dumps(my_tasks, ensure_ascii=False, indent=2)

    except Exception as e:
        logger.exception("Error listing tasks")
        return json.dumps({"error": f"Failed to list tasks: {e}"}, ensure_ascii=False)


# ============================================================
# 4. 提交任务汇报（执行者用）
# ============================================================

def submit_task_report(
    task_id: int,
    content: str,
    report_type: str = "progress",
    attachments: Optional[List[str]] = None,
    parent_agent: Any = None,
) -> str:
    """
    [所有 Agent 可用] 向我的管理者提交任务汇报。

    汇报类型：
    - "progress": 进度更新汇报（定期更新）
    - "final": 最终完成汇报（提交后任务状态变为 review 等待审批）

    Args:
        task_id: 要汇报的任务 ID
        content: 汇报内容（详细描述完成情况）
        report_type: 汇报类型 (progress, final)，默认 progress
        attachments: 附件文件路径列表（可选）
        parent_agent: 调用此工具的父 Agent（自动注入）

    Returns:
        JSON 字符串包含汇报详情
    """
    try:
        store = _get_org_store()
        my_id = _get_agent_id_from_context(parent_agent)

        # 验证任务存在且是分配给我的
        tasks = TaskRepository(store)
        task = tasks.get(task_id)
        if not task:
            return json.dumps({"error": f"Task {task_id} not found"}, ensure_ascii=False)

        if task["assignee_agent_id"] != my_id:
            return json.dumps({
                "error": f"Task {task_id} is not assigned to you (agent {my_id})"
            }, ensure_ascii=False)

        # 创建汇报
        reports = TaskReportRepository(store)
        report = store.transaction(lambda conn: reports.create({
            "task_id": task_id,
            "reporter_agent_id": my_id,
            "content": content,
            "attachments": attachments or [],
            "report_type": report_type,
        }, conn=conn))

        # 如果是最终汇报，更新任务状态为 review
        if report_type == "final":
            store.transaction(lambda conn: tasks.update(
                task_id, {"status": "review"}, set(), conn=conn
            ))
            report["task_status_updated"] = "review"

        return json.dumps(report, ensure_ascii=False, indent=2)

    except Exception as e:
        logger.exception("Error submitting report")
        return json.dumps({"error": f"Failed to submit report: {e}"}, ensure_ascii=False)


# ============================================================
# 5. 审批任务（管理者用）
# ============================================================

def approve_task(
    task_id: int,
    decision: str,
    comment: str = "",
    parent_agent: Any = None,
) -> str:
    """
    [管理者专用] 审批下属提交的最终任务汇报。

    决策选项：
    - "approve": 批准通过，任务状态变为 completed
    - "reject": 拒绝，任务状态变为 rejected
    - "request_changes": 要求修改，任务状态变为 in_progress，下属继续修改

    Args:
        task_id: 要审批的任务 ID
        decision: 决策 (approve, reject, request_changes)
        comment: 审批意见（建议必填，让下属知道原因）
        parent_agent: 调用此工具的父 Agent（自动注入）

    Returns:
        JSON 字符串包含审批结果
    """
    valid_decisions = ["approve", "reject", "request_changes"]
    if decision not in valid_decisions:
        return json.dumps({
            "error": f"Invalid decision: {decision}. Must be one of: {', '.join(valid_decisions)}"
        }, ensure_ascii=False)

    try:
        store = _get_org_store()
        my_id = _get_agent_id_from_context(parent_agent)

        # 权限校验
        require_management_permission(store, my_id, "can_approve_tasks")

        # 验证任务存在且是我创建的（我分配的任务我才能审批）
        tasks = TaskRepository(store)
        task = tasks.get(task_id)
        if not task:
            return json.dumps({"error": f"Task {task_id} not found"}, ensure_ascii=False)

        if task["creator_agent_id"] != my_id:
            return json.dumps({
                "error": f"Task {task_id} was not created by you. You can only approve tasks you assigned."
            }, ensure_ascii=False)

        # 创建审批记录
        approvals = ApprovalRepository(store)
        approval = store.transaction(lambda conn: approvals.create({
            "task_id": task_id,
            "approver_agent_id": my_id,
            "decision": decision,
            "comment": comment,
        }, conn=conn))

        # 更新任务状态
        status_map = {
            "approve": "completed",
            "reject": "rejected",
            "request_changes": "in_progress",
        }
        new_status = status_map[decision]
        store.transaction(lambda conn: tasks.update(
            task_id, {"status": new_status}, set(), conn=conn
        ))
        approval["task_status_updated"] = new_status

        # 如果批准完成，记录完成时间
        if decision == "approve":
            store.transaction(lambda conn: tasks.update(
                task_id, {"completed_at": datetime.now()}, set(), conn=conn
            ))

        return json.dumps(approval, ensure_ascii=False, indent=2)

    except PermissionError as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)
    except Exception as e:
        logger.exception("Error approving task")
        return json.dumps({"error": f"Failed to approve task: {e}"}, ensure_ascii=False)


# ============================================================
# 6. 跨 Agent 工作区文件共享
# ============================================================

def share_file_with_subordinate(
    subordinate_agent_id: int,
    source_file_path: str,
    target_file_name: Optional[str] = None,
    parent_agent: Any = None,
) -> str:
    """
    [管理者专用] 将我的工作区的文件共享给下属的任务工作区。

    用于共享：参考文档、需求说明、设计稿、数据文件等。

    Args:
        subordinate_agent_id: 下属 Agent 的 ID
        source_file_path: 源文件路径（在我的工作区内）
        target_file_name: 目标文件名（可选，默认使用源文件名）
        parent_agent: 调用此工具的父 Agent（自动注入）

    Returns:
        JSON 字符串包含共享结果
    """
    try:
        store = _get_org_store()
        my_id = _get_agent_id_from_context(parent_agent)

        # 权限校验
        require_management_permission(store, my_id, "can_assign_tasks")

        # 上下级关系校验
        can_assign, reason = can_assign_to_agent(store, my_id, subordinate_agent_id)
        if not can_assign:
            return json.dumps({"error": reason}, ensure_ascii=False)

        # 获取当前 agent 的工作区，验证源文件在工作区内
        # 防止路径遍历攻击（../ 穿越目录）
        agents_repo = AgentRepository(store)
        me = agents_repo.get(my_id)
        my_workspace = me.get("workspace_path") if me else None

        if not my_workspace:
            return json.dumps({
                "error": "Your agent has no configured workspace. Cannot share files."
            }, ensure_ascii=False)

        # 验证源文件路径，并解析防止 ../ 遍历
        source_path = Path(source_file_path).expanduser().resolve()

        # 必须在我的工作区内
        my_workspace_path = Path(my_workspace).resolve()
        if not str(source_path).startswith(str(my_workspace_path)):
            return json.dumps({
                "error": f"Source file {source_file_path} is outside your workspace. "
                f"You can only share files from your workspace: {my_workspace}"
            }, ensure_ascii=False)

        # 验证源文件存在
        if not source_path.exists():
            return json.dumps({"error": f"Source file not found: {source_file_path}"}, ensure_ascii=False)
        if not source_path.is_file():
            return json.dumps({"error": f"Source is not a file: {source_file_path}"}, ensure_ascii=False)

        # 获取下属工作区
        agents = AgentRepository(store)
        subordinate = agents.get(subordinate_agent_id)
        if not subordinate or not subordinate.get("workspace_path"):
            return json.dumps({"error": f"Subordinate {subordinate_agent_id} has no workspace configured"}, ensure_ascii=False)

        # 确定目标路径
        target_name = target_file_name or source_path.name
        target_dir = Path(subordinate["workspace_path"]) / "shared_from_manager"
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / target_name

        # 复制文件
        shutil.copy2(source_path, target_path)

        return json.dumps({
            "success": True,
            "source_file": str(source_path),
            "target_file": str(target_path),
            "subordinate_id": subordinate_agent_id,
            "file_size_bytes": target_path.stat().st_size,
        }, ensure_ascii=False, indent=2)

    except PermissionError as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)
    except Exception as e:
        logger.exception("Error sharing file")
        return json.dumps({"error": f"Failed to share file: {e}"}, ensure_ascii=False)


# ============================================================
# Tool Schemas for Function Calling
# ============================================================

# Exported for registry:
# ASSIGN_TASK_SCHEMA
# LIST_SUBORDINATES_SCHEMA
# LIST_MY_TASKS_SCHEMA
# SUBMIT_REPORT_SCHEMA
# APPROVE_TASK_SCHEMA
# SHARE_FILE_SCHEMA

ASSIGN_TASK_SCHEMA = {
    "name": "assign_task_to_subordinate",
    "description": """
[管理者专用] 给你的直属下属分配任务。

**重要：**
- 你必须是管理岗位才能使用此工具
- 你只能分配给你的直属下属（使用 list_my_subordinates 查看团队）
- 下属会收到任务通知，你可以通过 list_my_tasks 跟踪进度

**任务分配后：**
1. 下属 Agent 会看到这个任务（在他们的 list_my_tasks 中）
2. 下属定期 submit_task_report 汇报进度
3. 最终汇报后，你使用 approve_task 审批
""",
    "parameters": {
        "type": "object",
        "properties": {
            "subordinate_agent_id": {
                "type": "integer",
                "description": "下属 Agent 的 ID（从 list_my_subordinates 获取）",
            },
            "title": {
                "type": "string",
                "description": "简短明确的任务标题（10-80字）",
            },
            "description": {
                "type": "string",
                "description": "详细的任务描述，包括验收标准、期望结果、注意事项",
            },
            "priority": {
                "type": "string",
                "enum": ["low", "normal", "high", "urgent"],
                "description": "任务优先级。urgent 仅用于紧急情况",
                "default": "normal",
            },
            "deadline": {
                "type": "string",
                "description": "截止时间（ISO格式），例如: 2026-05-15T18:00:00",
            },
            "parent_task_id": {
                "type": "integer",
                "description": "父任务 ID（用于将大任务拆分成子任务）",
            },
        },
        "required": ["subordinate_agent_id", "title"],
    },
}

LIST_SUBORDINATES_SCHEMA = {
    "name": "list_my_subordinates",
    "description": """
[管理者专用] 查看你的所有直属下属及其当前工作负载。

**返回信息包括：**
- 下属姓名、职位
- 当前进行中的任务数量
- 总任务数量
- 技能标签

**使用场景：**
- 分配任务前查看谁有空闲
- 了解团队整体工作负载
- 识别工作过载的成员
""",
    "parameters": {
        "type": "object",
        "properties": {
            "include_status": {
                "type": "boolean",
                "description": "是否包含任务工作负载统计（默认 true）",
                "default": True,
            },
        },
    },
}

LIST_MY_TASKS_SCHEMA = {
    "name": "list_my_tasks",
    "description": """
[所有 Agent 可用] 查看分配给我的任务列表。

**任务状态：**
- pending: 待开始
- in_progress: 进行中
- review: 已提交最终汇报，等待管理者审批
- completed: 已完成，管理者已批准
- rejected: 被拒绝

**使用场景：**
- 早晨查看今天要做的任务
- 检查任务截止日期
- 查看管理者是否已审批我的汇报
""",
    "parameters": {
        "type": "object",
        "properties": {
            "status": {
                "type": "string",
                "enum": ["pending", "in_progress", "review", "completed", "rejected"],
                "description": "按状态过滤任务，不传则显示所有",
            },
        },
    },
}

SUBMIT_REPORT_SCHEMA = {
    "name": "submit_task_report",
    "description": """
[所有 Agent 可用] 向你的管理者提交任务汇报。

**汇报类型：**
- progress: 进度更新（定期汇报工作进展）
- final: 最终完成汇报（提交后任务状态变为 review，等待管理者审批）

**汇报建议：**
- 进度汇报：每周 1-2 次，说明做了什么、遇到什么问题、下一步计划
- 最终汇报：详细说明完成情况、交付物、测试结果，确保管理者能快速验收
""",
    "parameters": {
        "type": "object",
        "properties": {
            "task_id": {
                "type": "integer",
                "description": "要汇报的任务 ID",
            },
            "content": {
                "type": "string",
                "description": "详细的汇报内容（已完成工作、遇到的问题、下一步计划等）",
            },
            "report_type": {
                "type": "string",
                "enum": ["progress", "final"],
                "description": "汇报类型：progress = 进度更新, final = 最终完成",
                "default": "progress",
            },
            "attachments": {
                "type": "array",
                "items": {"type": "string"},
                "description": "附件文件路径列表（例如输出的文档、代码文件等）",
            },
        },
        "required": ["task_id", "content"],
    },
}

APPROVE_TASK_SCHEMA = {
    "name": "approve_task",
    "description": """
[管理者专用] 审批你分配给下属的任务。

当下属提交了 final 类型的汇报后，任务状态变为 "review"，
你需要进行审批并给出明确的意见。

**决策选项：**
- approve: 批准通过 → 任务完成
- reject: 拒绝 → 任务标记为 rejected（工作不可接受，需要重做）
- request_changes: 要求修改 → 任务回到 in_progress，下属需要修改后重新提交

**建议：**
- 无论哪个决策，都请写 comment，让下属知道你的理由和期望
- 批准时可以提表扬和改进建议
- 要求修改时要具体说明需要改什么
""",
    "parameters": {
        "type": "object",
        "properties": {
            "task_id": {
                "type": "integer",
                "description": "要审批的任务 ID",
            },
            "decision": {
                "type": "string",
                "enum": ["approve", "reject", "request_changes"],
                "description": "审批决策",
            },
            "comment": {
                "type": "string",
                "description": "审批意见（建议必填，让下属知道原因）",
            },
        },
        "required": ["task_id", "decision"],
    },
}

SHARE_FILE_SCHEMA = {
    "name": "share_file_with_subordinate",
    "description": """
[管理者专用] 将你工作区的文件共享给你的下属。

**使用场景：**
- 给下属发送需求文档、设计稿
- 共享参考资料和数据文件
- 向下属传递模板和示例文件

**注意：**
- 文件会被复制到下属的 workspace/shared_from_manager/ 目录
- 下属可以读取和修改这份副本，不会影响你的原文件
""",
    "parameters": {
        "type": "object",
        "properties": {
            "subordinate_agent_id": {
                "type": "integer",
                "description": "下属 Agent 的 ID（从 list_my_subordinates 获取）",
            },
            "source_file_path": {
                "type": "string",
                "description": "你工作区内的源文件完整路径",
            },
            "target_file_name": {
                "type": "string",
                "description": "下属那边的文件名（可选，默认使用原文件名）",
            },
        },
        "required": ["subordinate_agent_id", "source_file_path"],
    },
}


# ============================================================
# 7. 智能任务拆分（管理者用）
# ============================================================

def plan_task_assignment(
    parent_task_id: int,
    subtask_assignments: List[Dict[str, Any]],
    parent_agent: Any = None,
) -> str:
    """
    [管理者专用] 将一个大任务智能拆分成多个子任务，并分配给不同的下属。

    这是批量分配任务的便捷方式，可以一次性将拆分好的子任务分配给多个下属。

    Args:
        parent_task_id: 父任务 ID（要拆分的大任务）
        subtask_assignments: 子任务分配列表，每个元素包含:
            - subordinate_agent_id: 下属 Agent ID
            - title: 子任务标题
            - description: 子任务描述
            - priority: 优先级 (low, normal, high, urgent)，默认 normal
            - deadline: 截止时间（ISO格式，可选）
        parent_agent: 调用此工具的父 Agent（自动注入）

    Returns:
        JSON 字符串包含创建的所有子任务详情
    """
    try:
        store = _get_org_store()
        my_id = _get_agent_id_from_context(parent_agent)

        # 验证父任务存在且由我创建
        tasks = TaskRepository(store)
        parent_task = tasks.get(parent_task_id)
        if not parent_task:
            return json.dumps({"error": f"Parent task {parent_task_id} not found"}, ensure_ascii=False)

        if parent_task["creator_agent_id"] != my_id:
            return json.dumps({
                "error": f"Task {parent_task_id} was not created by you. You can only split tasks you assigned."
            }, ensure_ascii=False)

        created_tasks = []
        errors = []

        for idx, assignment in enumerate(subtask_assignments):
            try:
                # 提取字段
                subordinate_id = assignment.get("subordinate_agent_id")
                title = assignment.get("title")
                description = assignment.get("description", "")
                priority = assignment.get("priority", "normal")
                deadline = assignment.get("deadline")

                if not subordinate_id or not title:
                    errors.append(f"Task #{idx}: missing subordinate_agent_id or title")
                    continue

                # 检查权限
                can_assign, reason = can_assign_to_agent(store, my_id, subordinate_id)
                if not can_assign:
                    errors.append(f"Task '{title}': {reason}")
                    continue

                # 解析截止时间
                deadline_dt = None
                if deadline:
                    try:
                        deadline_dt = datetime.fromisoformat(deadline)
                    except ValueError:
                        errors.append(f"Task '{title}': Invalid deadline format: {deadline}")
                        continue

                # 创建子任务
                task = store.transaction(lambda conn: tasks.create({
                    "title": title,
                    "description": description,
                    "priority": priority,
                    "creator_agent_id": my_id,
                    "assignee_agent_id": subordinate_id,
                    "parent_task_id": parent_task_id,
                    "deadline_at": deadline_dt,
                }, conn=conn))

                # 创建任务工作区
                try:
                    agents = AgentRepository(store)
                    subordinate = agents.get(subordinate_id)
                    if subordinate and subordinate.get("workspace_path"):
                        task_workspace = Path(subordinate["workspace_path"]) / "tasks" / f"task-{task['id']}"
                        task_workspace.mkdir(parents=True, exist_ok=True)
                        tasks.update(task["id"], {"workspace_path": str(task_workspace)}, set())
                        task["workspace_path"] = str(task_workspace)
                except Exception as e:
                    logger.warning(f"Failed to create task workspace for {title}: {e}")

                created_tasks.append(task)

            except Exception as e:
                errors.append(f"Task #{idx}: {str(e)}")

        # 更新父任务状态为 in_progress（开始执行）
        if created_tasks and parent_task["status"] == "pending":
            store.transaction(lambda conn: tasks.update(
                parent_task_id, {"status": "in_progress", "started_at": datetime.now()}, set(), conn=conn
            ))

        result = {
            "parent_task_id": parent_task_id,
            "created_count": len(created_tasks),
            "created_tasks": created_tasks,
        }
        if errors:
            result["errors"] = errors

        return json.dumps(result, ensure_ascii=False, indent=2)

    except PermissionError as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)
    except Exception as e:
        logger.exception("Error planning task assignment")
        return json.dumps({"error": f"Failed to plan task assignment: {e}"}, ensure_ascii=False)


# ============================================================
# 8. 获取所有子任务状态汇总（管理者用）
# ============================================================

def get_all_subtasks_status(
    parent_task_id: int,
    parent_agent: Any = None,
) -> str:
    """
    [管理者专用] 获取一个父任务下所有子任务的状态汇总。

    用于管理者查看整体进度，统计完成情况。

    Args:
        parent_task_id: 父任务 ID
        parent_agent: 调用此工具的父 Agent（自动注入）

    Returns:
        JSON 字符串包含：
        - 汇总统计（各状态数量）
        - 每个子任务的详细状态
        - 最新汇报信息
    """
    try:
        store = _get_org_store()
        my_id = _get_agent_id_from_context(parent_agent)

        # 验证父任务存在且由我创建
        tasks = TaskRepository(store)
        parent_task = tasks.get(parent_task_id)
        if not parent_task:
            return json.dumps({"error": f"Parent task {parent_task_id} not found"}, ensure_ascii=False)

        if parent_task["creator_agent_id"] != my_id:
            return json.dumps({
                "error": f"Task {parent_task_id} was not created by you"
            }, ensure_ascii=False)

        # 获取所有子任务
        subtasks = tasks.list_by_parent(parent_task_id)

        # 补充汇报信息
        reports = TaskReportRepository(store)
        for task in subtasks:
            task_reports = reports.list_by_task(task["id"])
            task["reports_count"] = len(task_reports)
            if task_reports:
                task["latest_report"] = task_reports[0]

        # 统计汇总
        status_counts = {
            "pending": 0,
            "in_progress": 0,
            "review": 0,
            "completed": 0,
            "rejected": 0,
        }
        for task in subtasks:
            status = task["status"]
            status_counts[status] = status_counts.get(status, 0) + 1

        result = {
            "parent_task": parent_task,
            "summary": {
                "total_subtasks": len(subtasks),
                "status_counts": status_counts,
                "completed_count": status_counts.get("completed", 0),
                "pending_count": status_counts.get("pending", 0) + status_counts.get("in_progress", 0),
            },
            "subtasks": subtasks,
        }

        return json.dumps(result, ensure_ascii=False, indent=2)

    except Exception as e:
        logger.exception("Error getting subtasks status")
        return json.dumps({"error": f"Failed to get subtasks status: {e}"}, ensure_ascii=False)


# ============================================================
# 工具 Schema 定义
# ============================================================

PLAN_TASK_ASSIGNMENT_SCHEMA = {
    "name": "plan_task_assignment",
    "description": """
[管理者专用] 将一个大任务智能拆分成多个子任务，批量分配给多个下属。

**使用场景：**
- 你收到一个大任务，需要拆解分给不同的团队成员
- 每个子任务分配给最合适的下属
- 批量一次性创建所有子任务

**优势：**
- 保持任务层级关系（父任务 → 子任务）
- 可以通过 get_all_subtasks_status 查看整体进度
- 自动更新父任务状态为 in_progress

**每个分配包含：**
- subordinate_agent_id: 给谁分配
- title: 子任务标题（简短明确）
- description: 详细描述和验收标准
- priority: 优先级（默认 normal）
- deadline: 截止时间（可选，ISO格式）
""",
    "parameters": {
        "type": "object",
        "properties": {
            "parent_task_id": {
                "type": "integer",
                "description": "要拆分的父任务 ID（这个大任务是你创建的）",
            },
            "subtask_assignments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "subordinate_agent_id": {
                            "type": "integer",
                            "description": "接收此子任务的下属 Agent ID",
                        },
                        "title": {
                            "type": "string",
                            "description": "子任务标题，简短明确",
                        },
                        "description": {
                            "type": "string",
                            "description": "子任务详细描述，包含验收标准",
                        },
                        "priority": {
                            "type": "string",
                            "enum": ["low", "normal", "high", "urgent"],
                            "description": "优先级，默认 normal",
                            "default": "normal",
                        },
                        "deadline": {
                            "type": "string",
                            "description": "截止时间（ISO格式，如 2026-05-15T18:00:00）",
                        },
                    },
                    "required": ["subordinate_agent_id", "title", "description"],
                },
                "description": "子任务分配列表",
            },
        },
        "required": ["parent_task_id", "subtask_assignments"],
    },
}

GET_ALL_SUBTASKS_STATUS_SCHEMA = {
    "name": "get_all_subtasks_status",
    "description": """
[管理者专用] 获取一个父任务下所有子任务的状态汇总。

**使用场景：**
- 定期检查整体项目进度
- 查看哪些任务已经完成，哪些还在进行中
- 查看每个子任务的最新汇报

**返回信息：**
- 汇总统计：各状态的任务数量
- 每个子任务：详细信息 + 最新汇报
- 父任务当前状态
""",
    "parameters": {
        "type": "object",
        "properties": {
            "parent_task_id": {
                "type": "integer",
                "description": "父任务 ID",
            },
        },
        "required": ["parent_task_id"],
    },
}


# ============================================================
# Tool Registration
# ============================================================

def _check_org_management_requirements() -> bool:
    """Check if organization management system is properly configured."""
    try:
        from gateway.org.store import OrganizationStore
        from gateway.org.services import OrganizationService
        store = OrganizationStore()
        service = OrganizationService(store)
        # Verify tables exist by doing a simple query
        service.get_tree()
        return True
    except Exception as e:
        logger.debug(f"Organization management not available: {e}")
        return False


registry.register(
    name="assign_task_to_subordinate",
    toolset="organization",
    schema=ASSIGN_TASK_SCHEMA,
    handler=lambda args, **kw: assign_task_to_subordinate(
        subordinate_agent_id=args.get("subordinate_agent_id"),
        title=args.get("title"),
        description=args.get("description", ""),
        priority=args.get("priority", "normal"),
        deadline=args.get("deadline"),
        parent_task_id=args.get("parent_task_id"),
        parent_agent=kw.get("parent_agent"),
    ),
    check_fn=_check_org_management_requirements,
    emoji="📋",
)

registry.register(
    name="list_my_subordinates",
    toolset="organization",
    schema=LIST_SUBORDINATES_SCHEMA,
    handler=lambda args, **kw: list_my_subordinates(
        include_status=args.get("include_status", True),
        parent_agent=kw.get("parent_agent"),
    ),
    check_fn=_check_org_management_requirements,
    emoji="👥",
)

registry.register(
    name="list_my_tasks",
    toolset="organization",
    schema=LIST_MY_TASKS_SCHEMA,
    handler=lambda args, **kw: list_my_tasks(
        status=args.get("status"),
        parent_agent=kw.get("parent_agent"),
    ),
    check_fn=_check_org_management_requirements,
    emoji="✅",
)

registry.register(
    name="submit_task_report",
    toolset="organization",
    schema=SUBMIT_REPORT_SCHEMA,
    handler=lambda args, **kw: submit_task_report(
        task_id=args.get("task_id"),
        content=args.get("content"),
        report_type=args.get("report_type", "progress"),
        attachments=args.get("attachments"),
        parent_agent=kw.get("parent_agent"),
    ),
    check_fn=_check_org_management_requirements,
    emoji="📝",
)

registry.register(
    name="approve_task",
    toolset="organization",
    schema=APPROVE_TASK_SCHEMA,
    handler=lambda args, **kw: approve_task(
        task_id=args.get("task_id"),
        decision=args.get("decision"),
        comment=args.get("comment", ""),
        parent_agent=kw.get("parent_agent"),
    ),
    check_fn=_check_org_management_requirements,
    emoji="✅",
)

registry.register(
    name="share_file_with_subordinate",
    toolset="organization",
    schema=SHARE_FILE_SCHEMA,
    handler=lambda args, **kw: share_file_with_subordinate(
        subordinate_agent_id=args.get("subordinate_agent_id"),
        source_file_path=args.get("source_file_path"),
        target_file_name=args.get("target_file_name"),
        parent_agent=kw.get("parent_agent"),
    ),
    check_fn=_check_org_management_requirements,
    emoji="📁",
)

registry.register(
    name="plan_task_assignment",
    toolset="organization",
    schema=PLAN_TASK_ASSIGNMENT_SCHEMA,
    handler=lambda args, **kw: plan_task_assignment(
        parent_task_id=args.get("parent_task_id"),
        subtask_assignments=args.get("subtask_assignments", []),
        parent_agent=kw.get("parent_agent"),
    ),
    check_fn=_check_org_management_requirements,
    emoji="📋",
)

registry.register(
    name="get_all_subtasks_status",
    toolset="organization",
    schema=GET_ALL_SUBTASKS_STATUS_SCHEMA,
    handler=lambda args, **kw: get_all_subtasks_status(
        parent_task_id=args.get("parent_task_id"),
        parent_agent=kw.get("parent_agent"),
    ),
    check_fn=_check_org_management_requirements,
    emoji="📊",
)
