"""
Botivate HR Support - Approval Workflow Service
Zero Auto-Approval Policy: AI never approves. Only routes & records.
"""

from datetime import datetime, timezone, timedelta
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.models import (
    ApprovalRequest, Notification, Company, RequestStatus, RequestPriority, UserRole,
)
from app.models.schemas import ApprovalRequestCreate, ApprovalDecision
from app.adapters.adapter_factory import get_adapter
from app.utils.email_service import send_notification_email


# ── Create Approval Request ──────────────────────────────

async def create_approval_request(
    db: AsyncSession,
    company_id: str,
    data: ApprovalRequestCreate,
) -> ApprovalRequest:
    """
    Record a new approval request in the database.
    AI calls this; AI NEVER approves.
    """
    request = ApprovalRequest(
        company_id=company_id,
        employee_id=data.employee_id,
        employee_name=data.employee_name,
        request_type=data.request_type,
        request_details=data.request_details,
        context=data.context,
        priority=data.priority,
        assigned_to_role=data.assigned_to_role or UserRole.MANAGER,
        status=RequestStatus.PENDING,
    )
    db.add(request)
    await db.commit()
    await db.refresh(request)

    # Create notification for the authority
    notification = Notification(
        company_id=company_id,
        target_employee_id="__authority__",  # Will be resolved by role
        title=f"New {data.request_type.replace('_', ' ').title()} Request",
        message=f"{data.employee_name or data.employee_id} has submitted a {data.request_type} request. "
                f"Priority: {data.priority.value.upper()}. Please review and take action.",
        notification_type="approval_request",
        related_request_id=request.id,
    )
    db.add(notification)
    await db.commit()

    # Also write the request to the company's Google Sheet
    try:
        await write_request_to_sheet(db, request)
    except Exception as e:
        print(f"[SHEET CREATE WRITE ERROR] {e}")

    return request


# ── Process Decision (Approve / Reject) ──────────────────

async def process_decision(
    db: AsyncSession,
    request_id: str,
    decided_by: str,
    decision: ApprovalDecision,
) -> Optional[ApprovalRequest]:
    """Authority approves or rejects a request."""
    result = await db.execute(
        select(ApprovalRequest).where(ApprovalRequest.id == request_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        return None

    request.status = decision.status
    request.decision_note = decision.decision_note
    request.decided_by = decided_by
    request.decided_at = datetime.now(timezone.utc)

    # Create notification for the employee
    status_text = "approved" if decision.status == RequestStatus.APPROVED else "rejected"
    notification = Notification(
        company_id=request.company_id,
        target_employee_id=request.employee_id,
        title=f"Request {status_text.title()}",
        message=f"Your {request.request_type} request has been {status_text} by {decided_by}."
                + (f" Note: {decision.decision_note}" if decision.decision_note else ""),
        notification_type="decision_update",
        related_request_id=request.id,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(request)

    # Also update the company's Google Sheet if applicable
    try:
        await _update_sheet_status(db, request)
    except Exception as e:
        print(f"[SHEET UPDATE ERROR] {e}")

    return request


# ── Get Requests ─────────────────────────────────────────

async def get_pending_requests(
    db: AsyncSession, company_id: str, role: Optional[UserRole] = None
) -> List[ApprovalRequest]:
    """Fetch all pending requests for a company, optionally filtered by assigned role."""
    filters = [
        ApprovalRequest.company_id == company_id,
        ApprovalRequest.status == RequestStatus.PENDING,
    ]
    if role:
        filters.append(ApprovalRequest.assigned_to_role == role)

    result = await db.execute(select(ApprovalRequest).where(and_(*filters)))
    return list(result.scalars().all())


async def get_employee_requests(
    db: AsyncSession, company_id: str, employee_id: str
) -> List[ApprovalRequest]:
    """Fetch all requests for a specific employee."""
    from sqlalchemy import func
    result = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.company_id == company_id,
            func.lower(ApprovalRequest.employee_id) == employee_id.strip().lower(),
        ).order_by(ApprovalRequest.created_at.desc())
    )
    return list(result.scalars().all())


# ── Notifications ────────────────────────────────────────

async def get_notifications(
    db: AsyncSession, company_id: str, employee_id: str
) -> List[Notification]:
    """Fetch notifications for a specific employee."""
    result = await db.execute(
        select(Notification).where(
            Notification.company_id == company_id,
            Notification.target_employee_id == employee_id,
        ).order_by(Notification.created_at.desc())
    )
    return list(result.scalars().all())


async def mark_notification_read(db: AsyncSession, notification_id: str) -> bool:
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id)
    )
    notif = result.scalar_one_or_none()
    if notif:
        notif.is_read = True
        await db.commit()
        return True
    return False


# ── Background: Reminders & Escalation ───────────────────

async def check_pending_reminders(db: AsyncSession) -> dict:
    """
    Background task: runs periodically to check overdue approvals.
    - After 48 hours → send reminder
    - After 72 hours → escalate
    """
    now = datetime.now(timezone.utc)
    reminder_threshold = now - timedelta(hours=48)
    escalation_threshold = now - timedelta(hours=72)

    result = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.status == RequestStatus.PENDING,
        )
    )
    pending = list(result.scalars().all())

    reminders_sent = 0
    escalations = 0

    for req in pending:
        age = now - req.created_at.replace(tzinfo=timezone.utc)

        # Escalation (72+ hours)
        if age >= timedelta(hours=72) and not req.escalated:
            req.escalated = True
            req.status = RequestStatus.ESCALATED
            notification = Notification(
                company_id=req.company_id,
                target_employee_id="__authority__",
                title=f"ESCALATED: {req.request_type} from {req.employee_name or req.employee_id}",
                message=f"This request has been pending for over 72 hours and has been escalated.",
                notification_type="escalation",
                related_request_id=req.id,
            )
            db.add(notification)
            escalations += 1

        # Reminder (48+ hours)
        elif age >= timedelta(hours=48) and not req.reminder_sent:
            req.reminder_sent = True
            notification = Notification(
                company_id=req.company_id,
                target_employee_id="__authority__",
                title=f"Reminder: Pending {req.request_type} from {req.employee_name or req.employee_id}",
                message=f"This request has been waiting for over 48 hours. Please take action.",
                notification_type="reminder",
                related_request_id=req.id,
            )
            db.add(notification)
            reminders_sent += 1

    await db.commit()
    return {"reminders_sent": reminders_sent, "escalations": escalations}


# ── Helper: Write Request to Sheet on Creation ───────────

async def write_request_to_sheet(db: AsyncSession, request: ApprovalRequest) -> None:
    """When a request is created, the DB Agent updates the Google Sheet."""
    from app.models.models import DatabaseConnection
    from app.agents.db_agent import run_db_agent

    result = await db.execute(
        select(DatabaseConnection).where(
            DatabaseConnection.company_id == request.company_id,
            DatabaseConnection.is_active == True,
        )
    )
    db_conn = result.scalars().first()
    if not db_conn or not db_conn.schema_map:
        print("[SHEET WRITE] No active DB connection found for this company.")
        return

    # Build rich context for the DB Agent
    context = {
        "request_type": request.request_type,
        "status": request.status.value,
        "context_message": request.context,
        "employee_name": request.employee_name,
        "created_at": request.created_at.strftime("%d %B %Y") if request.created_at else "",
        "priority": request.priority.value if request.priority else "normal",
    }
    
    # Merge request_details (contains AI-extracted fields like dates, reason, etc.)
    if request.request_details:
        context.update(request.request_details)

    # Determine action string
    action = f"{request.request_type}_applied"

    # Run the DB Agent (sub-agent with its own LangGraph)
    sync_result = await run_db_agent(
        db_type=db_conn.db_type.value,
        connection_config=db_conn.connection_config,
        schema_map=db_conn.schema_map,
        employee_id=request.employee_id,
        action=action,
        context=context,
    )

    if sync_result["success"]:
        print(f"[SHEET WRITE] ✅ DB Agent synced: {sync_result['updates_applied']}")
        if sync_result.get("new_columns_created"):
            print(f"[SHEET WRITE] ✅ New columns: {sync_result['new_columns_created']}")
        if sync_result.get("verification"):
            print(f"[SHEET WRITE] ✅ Verified: {sync_result['verification']}")
    else:
        print(f"[SHEET WRITE] ❌ DB Agent failed: {sync_result['error']}")


# ── Helper: Update Sheet Status After Decision ───────────

async def _update_sheet_status(db: AsyncSession, request: ApprovalRequest) -> None:
    """Update the Google Sheet after approval/rejection using the DB Agent."""
    from app.models.models import DatabaseConnection
    from app.agents.db_agent import run_db_agent

    result = await db.execute(
        select(DatabaseConnection).where(
            DatabaseConnection.company_id == request.company_id,
            DatabaseConnection.is_active == True,
        )
    )
    db_conn = result.scalars().first()
    if not db_conn or not db_conn.schema_map:
        return

    status_text = request.status.value  # "approved" or "rejected"

    # Build rich decision context for the DB Agent
    context = {
        "request_type": request.request_type,
        "new_status": status_text,
        "decision_note": request.decision_note or "",
        "decided_by": request.decided_by or "",
        "decided_at": request.decided_at.strftime("%d %B %Y %H:%M") if request.decided_at else "",
        "employee_name": request.employee_name,
    }
    
    # Include request_details (dates, reason, leave_type, etc.)
    if request.request_details:
        context.update(request.request_details)

    # Determine action string  
    action = f"{request.request_type}_{status_text}"  # e.g. "leave_request_approved"

    # Run the DB Agent
    sync_result = await run_db_agent(
        db_type=db_conn.db_type.value,
        connection_config=db_conn.connection_config,
        schema_map=db_conn.schema_map,
        employee_id=request.employee_id,
        action=action,
        context=context,
    )

    if sync_result["success"]:
        print(f"[SHEET UPDATE] ✅ DB Agent decision synced: {sync_result['updates_applied']}")
    else:
        print(f"[SHEET UPDATE] ❌ DB Agent decision failed: {sync_result['error']}")


