import os
import tempfile

os.environ.setdefault("HERMES_HOME", tempfile.mkdtemp(prefix="hermes-recruit-test-"))

from gateway.platforms.api_server_recruit import RecruitAPIHandlers


def test_extract_record_rows_accepts_flat_record_payload():
    handler = RecruitAPIHandlers("token")

    rows = handler._extract_record_rows({
        "records": [
            {
                "company_name": "Acme",
                "position_title": "Backend Engineer",
                "city": "Shanghai",
                "salary_min": 20,
                "salary_max": 35,
                "salary_unit": "K",
                "skills": ["Python", "SQLite"],
                "must_have": ["Backend experience"],
                "status": "待评分",
            }
        ]
    })

    assert len(rows) == 1
    assert rows[0]["company_name"] == "Acme"
    assert rows[0]["position_title"] == "Backend Engineer"
    assert rows[0]["city"] == "Shanghai"
    assert rows[0]["salary_min"] == 20.0
    assert rows[0]["salary_max"] == 35.0
    assert rows[0]["skills_json"] == '["Python","SQLite"]'
    assert rows[0]["must_have_json"] == '["Backend experience"]'
    assert rows[0]["status"] == "待评分"


def test_extract_record_rows_accepts_nested_result_array():
    handler = RecruitAPIHandlers("token")

    rows = handler._extract_record_rows({
        "result": [
            {
                "company": {"name": "Example Co"},
                "position": {"title": "Frontend Engineer"},
                "requirements": {"skills": ["React"]},
            }
        ]
    })

    assert len(rows) == 1
    assert rows[0]["company_name"] == "Example Co"
    assert rows[0]["position_title"] == "Frontend Engineer"
    assert rows[0]["skills_json"] == '["React"]'


def test_extract_record_rows_accepts_direct_record_array():
    handler = RecruitAPIHandlers("token")

    rows = handler._extract_record_rows([
        {
            "company": "Direct Co",
            "title": "Data Engineer",
            "requirements": ["SQL"],
        }
    ])

    assert len(rows) == 1
    assert rows[0]["company_name"] == "Direct Co"
    assert rows[0]["position_title"] == "Data Engineer"
    assert rows[0]["must_have_json"] == '["SQL"]'
