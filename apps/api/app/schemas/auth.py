from uuid import UUID

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class SessionPatch(BaseModel):
    active_department_id: UUID | None


class RoleBrief(BaseModel):
    id: UUID
    name: str


class AssignmentOut(BaseModel):
    role: RoleBrief
    department_id: UUID | None


class UserOut(BaseModel):
    id: UUID
    username: str
    display_name: str
    email: str
    initials: str
    status: str


class DepartmentBrief(BaseModel):
    id: UUID
    code: str
    name: str


class CurrentUserOut(BaseModel):
    user: UserOut
    assignments: list[AssignmentOut]
    permissions: list[str]
    departments: list[DepartmentBrief]
    active_department_id: UUID | None
    can_select_all_departments: bool
    koha_configured: bool