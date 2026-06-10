import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  // ── Admin user ──────────────────────────────────────────────────────────────
  const hashed = await bcrypt.hash("Admin@1234", 12);

  const admin = await db.user.upsert({
    where:  { email: "admin@gildedglow.com" },
    update: {},
    create: {
      firstName:   "Admin",
      lastName:    "User",
      email:       "admin@gildedglow.com",
      password:    hashed,
      phoneNumber: "+1 555 000 0000",
      image:       null,
      role:        "admin",
    },
  });

  console.log(`Seeded admin user → id: ${admin.id}  email: ${admin.email}`);

  // ── Default / walk-in customer ──────────────────────────────────────────────
  // "direct-customer" is the POS fallback used when no specific customer is
  // selected. It must always exist and must never be deleted.
  // isDefault=true is the guard flag checked by the delete action.
  const directCustomer = await db.customer.upsert({
    where:  { id: 1 },
    update: {},
    create: {
      name:        "direct-customer",
      email:       "customer@gildedglow.com",
      phoneNumber: null,
      isDefault:   true,
    },
  });

  console.log(`Seeded default customer → id: ${directCustomer.id}  name: ${directCustomer.name}`);

  // ── Default roles ───────────────────────────────────────────────────────────
  // These populate the Role dropdown on the Users create/edit form.
  // Names are lowercase to match the User.role String field convention.
  const roles = ['admin', 'manager', 'cashier', 'user'];
  for (const name of roles) {
    await db.role.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Seeded roles: ${roles.join(', ')}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
