# Generated from designs/system-model.yaml on 2026-04-29T05:37:19.432Z. Do not hand-edit.
# Epic: Ordering

Feature: customer-orders-food
  As a Customer
  I want to order food
  So that I can eat

  Scenario: the order shows the new item with the correct price
    Given the menu is loaded
    When the customer adds an item to the order
    Then the order shows the new item with the correct price

  Scenario: the kitchen receives a ticket within one second
    Given the cart has at least one item
    When the customer submits the order
    Then the kitchen receives a ticket within one second

Feature: customer-views-menu
  As a Customer
  I want to see the menu
  So that I know what I can order

  Scenario: every available item is visible with name and price
    Given the menu is published
    When the customer opens the ordering page
    Then every available item is visible with name and price
