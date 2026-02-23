"""
Botivate HR Support - Approval & Notification API Router
Endpoints for managing approval workflows and notifications.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.schemas import (
    ApprovalRequestResponse, ApprovalDecision,
    NotificationResponse, TokenPayload,
)
from app.models.models import UserRole
from app.utils.auth import get_current_user
from app.services import approval_service

router = APIRouter(prefix="/api/approvals", tags=["Approvals"])


# ── Get Pending Approvals (For Authorities) ──────────────

@router.get("/pending", response_model=List[ApprovalRequestResponse])
async def get_pending_approvals(
    user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch all pending approval requests for the current user's role."""
    if user.role not in [UserRole.MANAGER, UserRole.HR, UserRole.ADMIN, UserRole.CEO]:
        raise HTTPException(status_code=403, detail="Only authorities can view pending approvals.")

    role_filter = UserRole(user.role) if isinstance(user.role, str) else user.role
    requests = await approval_service.get_pending_requests(db, user.company_id, role_filter)
    return requests


# ── Get My Requests (For Employees) ──────────────────────

@router.get("/my-requests", response_model=List[ApprovalRequestResponse])
async def get_my_requests(
    user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch all requests submitted by the current employee."""
    return await approval_service.get_employee_requests(db, user.company_id, user.employee_id)


# ── Approve / Reject ─────────────────────────────────────

@router.post("/{request_id}/decide", response_model=ApprovalRequestResponse)
async def decide_request(
    request_id: str,
    decision: ApprovalDecision,
    background_tasks: BackgroundTasks,
    user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject a pending request."""
    if user.role not in [UserRole.MANAGER, UserRole.HR, UserRole.ADMIN, UserRole.CEO]:
        raise HTTPException(status_code=403, detail="Only authorities can approve/reject requests.")

    result = await approval_service.process_decision(
        db, request_id, user.employee_name or user.employee_id, decision, background_tasks
    )
    if not result:
        raise HTTPException(status_code=404, detail="Request not found")
    return result


# ── Notifications ────────────────────────────────────────

notifications_router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@notifications_router.get("/", response_model=List[NotificationResponse])
async def get_my_notifications(
    user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch all notifications for the current user."""
    return await approval_service.get_notifications(
        db, user.company_id, user.employee_id, user.role
    )


@notifications_router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a notification as read."""
    success = await approval_service.mark_notification_read(db, notification_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Marked as read"}
