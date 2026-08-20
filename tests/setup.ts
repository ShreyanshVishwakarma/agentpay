import path from "node:path";

// Must run before any module under test is imported: src/lib/env.ts parses
// process.env at import time and every consumer reads that snapshot.
process.env.DATABASE_URL = `file:${path.resolve(__dirname, "..", "prisma", "test.db")}`;
process.env.RAZORPAY_KEY_ID = "rzp_test_integration_key";
process.env.RAZORPAY_KEY_SECRET = "test_integration_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
delete process.env.OPENAI_API_KEY;
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
