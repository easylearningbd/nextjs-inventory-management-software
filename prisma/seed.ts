import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const hashed = await bcrypt.hash("Admin@1234", 12);

  const admin = await db.user.upsert({
    where: { email: "admin@gildedglow.com" },
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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
