# EMS access roles

Admin → User Management supports EMT plus the eleven requested EMS clinical, leadership and support titles in Add user, Manage account and the role filter. The shared catalog is `nexus-ems-roles.js`:

| Stored role | Display name |
| --- | --- |
| EMT | EMT |
| ADVANCED_EMT | Advanced EMT |
| PARAMEDIC | Paramedic |
| FIELD_TRAINING_OFFICER | Field Training Officer |
| CLINICAL_COORDINATOR | Clinical Coordinator |
| OPERATIONS_MANAGER | Operations Manager |
| QUALITY_IMPROVEMENT_MANAGER | Quality Improvement Manager |
| COMPLIANCE_OFFICER | Compliance Officer |
| BILLING_CREDENTIALING_SPECIALIST | Billing/Credentialing Specialist |
| SAFETY_OFFICER | Safety Officer |
| CHIEF_OF_EMS | Chief of EMS |
| MEDICAL_DIRECTOR | Medical Director (contracted physician) |

The requested workspace mapping is:

- EMT, Advanced EMT and Paramedic: Driver/Crew (`DRIVER`).
- Field Training Officer: Training (`STAFF`).
- Operations Manager: Operations (`DISPATCHER`).
- Billing/Credentialing Specialist: Billing (`BILLING`).
- Chief of EMS: Executive (`EXECUTIVE`).
- Clinical Coordinator, Quality Improvement Manager, Compliance Officer, Safety Officer and Medical Director: Quality Assurance (`QA`).

Accounts retain their EMS title in `users.access_title`, while `users.role` stores the matching existing permission role. This keeps driver assignment, workforce eligibility and existing server authorization checks consistent. The account editor displays the EMS title; authenticated sessions expose the canonical role plus `titleRole`, `titleLabel` and `workspaceUrl`. Login and experience switching use the mapped workspace. These titles do not grant Administrator access. Public signup's existing role choices are unchanged.

Migration 095.001 adds the title field, normalizes any existing EMS role values to their mapped permission roles, and extends the role-request constraint. The API's table initialization and user creation/update allowlists use the EMS catalog; administrators retain the ability to switch into every experience. Existing training enrollment follows the canonical role. The deployment pipeline applies the migration before publishing. No credentials or production users were created during verification.
