# Generated from designs/system-model.yaml on 2026-04-29T05:37:19.433Z. Do not hand-edit.
# Epic: Payment

Feature: customer-pays
  As a Customer
  I want to pay the bill
  So that I can leave the restaurant

  Scenario: the order is marked paid within five seconds
    Given the order is open
    When the customer presents a card
    Then the order is marked paid within five seconds
