"""Director office discussion orchestration."""
from __future__ import annotations

from typing import Any, List, Dict
from .services import OrganizationService
from .store import now_ts


class DiscussionOrchestrator:
    """Orchestrates director agent discussions."""
    
    def __init__(self, service: OrganizationService):
        self.service = service
        self.role_priority = {"CEO": 1, "CTO": 2, "CFO": 3}
    
    async def start_discussion(self, company_id: int) -> List[Dict]:
        """Start discussion among director agents."""
        # 1. Get company info
        company = self.service.get_company(company_id)
        if not company:
            raise ValueError(f"Company {company_id} not found")
        
        # 2. Get director agents
        agents = self.service.get_agents_by_department_name(company_id, "董事办")
        
        # 3. Sort by role priority
        sorted_agents = sorted(
            agents,
            key=lambda x: self.role_priority.get(x.get("role", ""), 99)
        )
        
        # 4. Orchestrate discussion
        messages = []
        current_architecture = None
        
        for agent in sorted_agents:
            message = await self._agent_discuss(
                agent=agent,
                company_info={"name": company["name"], "goal": company["goal"]},
                current_architecture=current_architecture,
                discussion_history=messages
            )
            messages.append(message)
            
            if message.get("mermaid_code"):
                current_architecture = message["mermaid_code"]
        
        return messages
    
    async def _agent_discuss(self, agent: dict, company_info: dict,
                            current_architecture: str, discussion_history: list) -> dict:
        """Simulate agent discussion (calls LLM in real impl)."""
        # This is a simplified version - real impl calls the agent's LLM
        role = agent.get("role", "Director")
        
        # Generate Mermaid diagram based on role
        mermaid = self._generate_mermaid(role, company_info)
        
        return {
            "sender_agent_id": agent["id"],
            "sender_agent_role": role,
            "content": f"{role} Agent: Discussing org structure for {company_info['name']}",
            "mermaid_code": mermaid,
            "timestamp": now_ts()
        }
    
    def _generate_mermaid(self, role: str, company_info: dict) -> str:
        """Generate Mermaid diagram for role."""
        if role == "CEO":
            return """graph TD
    CEO[CEO Agent] --> Tech[技术部]
    CEO --> Market[市场部]
    CEO --> Finance[财务部]"""
        elif role == "CTO":
            return """graph TD
    CEO[CEO Agent] --> Tech[技术部]
    Tech --> Frontend[前端组]
    Tech --> Backend[后端组]
    CEO --> Market[市场部]"""
        else:  # CFO
            return """graph TD
    CEO[CEO Agent] --> Tech[技术部]
    CEO --> Market[市场部]
    CEO --> Finance[财务部]
    Finance --> Accounting[会计组]"""
