# Architecture Traceability

Generated from `designs/system-model.yaml` on 2026-04-28T09:02:18.912Z.

This report walks every business process down through the stack: tasks → functions → entities → services → modules → deployment nodes. Gaps in the trace are flagged with ⚠ and listed in the summary at the bottom.

## process:order — Order

### task:pay
- **Implemented by**:
  - **function:OrderService.pay**
    - Service: service:OrderService
    - Module:  module:checkout
    - Writes:  entity:Order
    - Deployed to: node:api *(Production)*

---

## Cross-layer gap summary

_No cross-layer gaps detected._
