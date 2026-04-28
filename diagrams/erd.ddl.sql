-- ╔══════════════════════════════════════════════════════════════╗
-- ║  DESIGN ARTIFACT — NOT A MIGRATION                            ║
-- ║  Generated from designs/system-model.yaml. Do not run as-is. ║
-- ║  Use as a starting point for a real migration written         ║
-- ║  elsewhere with explicit dialect, indexes, and rollbacks.     ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE TABLE Customer (
  id uuid PRIMARY KEY
);

CREATE TABLE Order (
  id         uuid PRIMARY KEY,
  customerId uuid,
  FOREIGN KEY (customerId) REFERENCES Customer(id)
);
