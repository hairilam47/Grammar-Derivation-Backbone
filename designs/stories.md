# Backlog

Generated from `designs/system-model.yaml` on 2026-04-29T09:00:56.592Z. Do not hand-edit.

## Ordering

### story:customer-orders-food (must · 5 pts)

**As a** Customer **I want to** order food **so that** I can eat.

```gherkin
Scenario: the order shows the new item with the correct price
  Given the menu is loaded
  When the customer adds an item to the order
  Then the order shows the new item with the correct price

Scenario: the kitchen receives a ticket within one second
  Given the cart has at least one item
  When the customer submits the order
  Then the kitchen receives a ticket within one second
```

- **Realizes**: usecase:order-food
- **Implemented by**: function:OrderService.placeOrder
- **Depends on**: story:customer-views-menu

### story:customer-views-menu (must · 2 pts)

**As a** Customer **I want to** see the menu **so that** I know what I can order.

```gherkin
Scenario: every available item is visible with name and price
  Given the menu is published
  When the customer opens the ordering page
  Then every available item is visible with name and price
```

- **Realizes**: usecase:order-food
- **Implemented by**: function:OrderService.placeOrder

## Payment

### story:customer-pays (should · 3 pts)

**As a** Customer **I want to** pay the bill **so that** I can leave the restaurant.

```gherkin
Scenario: the order is marked paid within five seconds
  Given the order is open
  When the customer presents a card
  Then the order is marked paid within five seconds
```

- **Realizes**: usecase:pay-bill
- **Implemented by**: function:PaymentService.charge
- **Depends on**: story:customer-orders-food

## Platform

### story:upgrade-postgres (could · 8 pts)

**As a** Operations **I want to** upgrade the database **so that** we get the latest security patches.
