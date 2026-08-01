import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const CATEGORIES: Array<{
  name: string;
  group: string;
  isIncome?: boolean;
  isTransfer?: boolean;
  sortOrder: number;
}> = [
  { name: "Income", group: "Income", isIncome: true, sortOrder: 1 },
  { name: "Paycheck", group: "Income", isIncome: true, sortOrder: 2 },
  { name: "Groceries", group: "Living", sortOrder: 10 },
  { name: "Dining", group: "Living", sortOrder: 11 },
  { name: "Rent / Mortgage", group: "Housing", sortOrder: 20 },
  { name: "Utilities", group: "Housing", sortOrder: 21 },
  { name: "Transport", group: "Living", sortOrder: 30 },
  { name: "Gas", group: "Living", sortOrder: 31 },
  { name: "Auto loan", group: "Living", sortOrder: 32 },
  { name: "Healthcare", group: "Living", sortOrder: 40 },
  { name: "Insurance", group: "Living", sortOrder: 41 },
  { name: "Subscriptions", group: "Lifestyle", sortOrder: 50 },
  { name: "Shopping", group: "Lifestyle", sortOrder: 51 },
  { name: "Entertainment", group: "Lifestyle", sortOrder: 52 },
  { name: "Travel", group: "Lifestyle", sortOrder: 53 },
  { name: "Education", group: "Lifestyle", sortOrder: 54 },
  { name: "Fees", group: "Banking", sortOrder: 60 },
  { name: "Interest", group: "Banking", isIncome: true, sortOrder: 61 },
  { name: "Credit Payment", group: "Transfers", isTransfer: true, sortOrder: 70 },
  { name: "Transfer", group: "Transfers", isTransfer: true, sortOrder: 71 },
  { name: "Savings Contribution", group: "Goals", sortOrder: 80 },
  { name: "Uncategorized", group: "Other", sortOrder: 99 },
];

const RULES: Array<{ pattern: string; category: string; priority: number }> = [
  { pattern: "WHOLE FOODS", category: "Groceries", priority: 10 },
  { pattern: "TRADER JOE", category: "Groceries", priority: 10 },
  { pattern: "SAFEWAY", category: "Groceries", priority: 10 },
  { pattern: "KROGER", category: "Groceries", priority: 10 },
  { pattern: "COSTCO", category: "Groceries", priority: 20 },
  { pattern: "STARBUCKS", category: "Dining", priority: 10 },
  { pattern: "MCDONALD", category: "Dining", priority: 10 },
  { pattern: "CHIPOTLE", category: "Dining", priority: 10 },
  { pattern: "UBER EATS", category: "Dining", priority: 10 },
  { pattern: "DOORDASH", category: "Dining", priority: 10 },
  { pattern: "NETFLIX", category: "Subscriptions", priority: 10 },
  { pattern: "SPOTIFY", category: "Subscriptions", priority: 10 },
  { pattern: "APPLE.COM/BILL", category: "Subscriptions", priority: 10 },
  { pattern: "AMAZON PRIME", category: "Subscriptions", priority: 10 },
  { pattern: "AMAZON", category: "Shopping", priority: 50 },
  { pattern: "SHELL", category: "Gas", priority: 10 },
  { pattern: "CHEVRON", category: "Gas", priority: 10 },
  { pattern: "UBER", category: "Transport", priority: 40 },
  { pattern: "LYFT", category: "Transport", priority: 10 },
  { pattern: "PG&E", category: "Utilities", priority: 10 },
  { pattern: "COMCAST", category: "Utilities", priority: 10 },
  { pattern: "DIRECT DEP", category: "Paycheck", priority: 10 },
  { pattern: "PAYROLL", category: "Paycheck", priority: 10 },
  { pattern: "PAYMENT THANK YOU", category: "Credit Payment", priority: 5 },
  { pattern: "AUTOPAY", category: "Credit Payment", priority: 20 },
];

async function main() {
  const pin = process.env.APP_PIN || "1234";
  const pinHash = await bcrypt.hash(pin, 10);
  const currency = process.env.CURRENCY || "USD";

  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      pinHash,
      currency,
      monthStartDay: 1,
      onboarded: false,
    },
    update: {},
  });

  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: c.name },
      create: {
        name: c.name,
        group: c.group,
        isIncome: c.isIncome ?? false,
        isTransfer: c.isTransfer ?? false,
        sortOrder: c.sortOrder,
      },
      update: {
        group: c.group,
        isIncome: c.isIncome ?? false,
        isTransfer: c.isTransfer ?? false,
        sortOrder: c.sortOrder,
      },
    });
  }

  const existingRules = await prisma.categoryRule.count();
  if (existingRules === 0) {
    for (const r of RULES) {
      const cat = await prisma.category.findUnique({ where: { name: r.category } });
      if (!cat) continue;
      await prisma.categoryRule.create({
        data: {
          pattern: r.pattern,
          categoryId: cat.id,
          priority: r.priority,
        },
      });
    }
  }

  console.log("[seed] AppSettings, categories, and rules ready");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });