# Architecture Traceability

Generated from `designs/system-model.yaml` on 2026-04-29T09:00:54.398Z.

This report walks every business process down through the stack: tasks → functions → entities → services → modules → deployment nodes. Gaps in the trace are flagged with ⚠ and listed in the summary at the bottom.

## Runtime platforms

Informational — declared in `technology.runtimes[]`. No cross-references are validated against this list.

- **Node.js 20 LTS** — used by node:api-host
- **PostgreSQL 15** — used by node:postgres-cluster

## process:order-fulfilment — Order Fulfilment

> Customer orders, pays, kitchen ships.

### Requirements
- **Use cases**:
  - usecase:order-food — Order Food
  - usecase:pay-bill — Pay Bill
- **Stories**:
  - story:customer-views-menu — see the menu *(must)*
  - story:customer-orders-food — order food *(must)*
  - story:customer-pays — pay the bill *(should)*

### task:place-order — "Place order"
- **Lane**: lane:customer
- **Implemented by**:
  - **function:OrderService.placeOrder**
    - Service: service:OrderService
    - Module:  module:checkout
    - Reads:   entity:Customer
    - Writes:  entity:Order
    - Deployed to: node:api-host *(Production, Staging)*

### task:take-payment — "Take payment"
- **Lane**: lane:customer
- **Implemented by**:
  - **function:PaymentService.charge**
    - Service: service:PaymentService
    - Module:  module:payment
    - Reads:   entity:Order
    - Writes:  entity:Payment
    - Deployed to: node:api-host *(Production, Staging)*

### task:fulfil — "Ship the order"
- **Lane**: lane:kitchen
- **Implemented by**:
  - **function:KitchenService.dispatch**
    - Service: service:KitchenService
    - Module:  module:kitchen
    - Reads:   entity:Order
    - Deployed to: node:api-host *(Production, Staging)*

---

## Cross-layer gap summary

- **Nodes referenced by no module (informational)** (2):
  - node:postgres-cluster
  - node:legacy-vm
- **Stories that realize no use case (informational)** (1):
  - story:upgrade-postgres
- **Use cases not realized by any story (informational)** (1):
  - usecase:archive-old-orders
