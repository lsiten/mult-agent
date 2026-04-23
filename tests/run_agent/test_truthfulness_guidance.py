"""Test that TRUTHFULNESS_GUIDANCE is properly injected into system prompts."""

import pytest
from agent.prompt_builder import TRUTHFULNESS_GUIDANCE


def test_truthfulness_guidance_content():
    """Verify TRUTHFULNESS_GUIDANCE contains anti-hallucination instructions."""
    assert "NEVER invent, fabricate, or hallucinate" in TRUTHFULNESS_GUIDANCE
    assert "ground factual claims in tool outputs" in TRUTHFULNESS_GUIDANCE
    assert "DO NOT assume files exist" in TRUTHFULNESS_GUIDANCE
    assert "DO NOT reinterpret or rationalize" in TRUTHFULNESS_GUIDANCE
    assert "uncertainty is better than falsehood" in TRUTHFULNESS_GUIDANCE


def test_truthfulness_guidance_import():
    """Verify TRUTHFULNESS_GUIDANCE can be imported from prompt_builder."""
    from agent.prompt_builder import TRUTHFULNESS_GUIDANCE
    assert isinstance(TRUTHFULNESS_GUIDANCE, str)
    assert len(TRUTHFULNESS_GUIDANCE) > 100


@pytest.mark.asyncio
async def test_truthfulness_guidance_injected_in_system_prompt(tmp_path):
    """Verify TRUTHFULNESS_GUIDANCE appears in the constructed system prompt."""
    import sys
    import os
    sys.path.insert(0, str(tmp_path.parent.parent))

    # Mock minimal environment
    os.environ["HERMES_HOME"] = str(tmp_path)
    os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test-key"

    from run_agent import AIAgent

    # Create agent with tools (truthfulness guidance only injects when tools are present)
    agent = AIAgent(
        model="claude-sonnet-4-6",
        cwd=str(tmp_path),
        verbose=False
    )

    # Build system prompt (will trigger truthfulness guidance injection)
    system_prompt = agent._build_system_prompt()

    # Verify truthfulness guidance is present
    assert TRUTHFULNESS_GUIDANCE in system_prompt or \
           "NEVER invent, fabricate, or hallucinate" in system_prompt, \
           "TRUTHFULNESS_GUIDANCE should be injected for models with tools"
