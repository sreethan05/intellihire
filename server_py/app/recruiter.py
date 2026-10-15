"""
IntelliHire Recruiter Facade Module
Compatibility module re-exporting recruiter service and router capabilities.
"""

from .recruiter_service import (
    get_drive_college_ids,
    create_candidate,
    get_candidates_list,
    get_colleges_list,
    get_colleges_summary,
    create_drive,
    get_drives_list,
    get_eligible_candidates,
    assign_exam,
    get_dashboard_data,
    get_ai_config,
    save_ai_config,
    get_compare_candidates,
    generate_ai_shortlist,
    upload_offer_letter,
    find_eligible_candidates,
)
from .routers.recruiter_candidates import router as recruiter_candidates_router
from .routers.recruiter_drives import router as recruiter_drives_router
from .routers.recruiter_dashboard import router as recruiter_dashboard_router

__all__ = [
    "get_drive_college_ids",
    "create_candidate",
    "get_candidates_list",
    "get_colleges_list",
    "get_colleges_summary",
    "create_drive",
    "get_drives_list",
    "get_eligible_candidates",
    "assign_exam",
    "get_dashboard_data",
    "get_ai_config",
    "save_ai_config",
    "get_compare_candidates",
    "generate_ai_shortlist",
    "upload_offer_letter",
    "find_eligible_candidates",
    "recruiter_candidates_router",
    "recruiter_drives_router",
    "recruiter_dashboard_router",
]
