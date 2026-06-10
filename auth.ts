import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut, unstable_update: updateSession } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        // findFirst so we can also filter out soft-deleted accounts.
        // findUnique only accepts unique-constraint fields in WHERE.
        const user = await db.user.findFirst({ where: { email, deletedAt: null } })
        if (!user) return null

        const passwordMatch = await bcrypt.compare(password, user.password)
        if (!passwordMatch) return null

        // Return user without the password field
        const { password: _pw, ...safeUser } = user
        return {
          id:        String(safeUser.id),
          email:     safeUser.email,
          name:      `${safeUser.firstName} ${safeUser.lastName}`,
          image:     safeUser.image,
          role:      safeUser.role,
        }
      },
    }),
  ],

  session: { strategy: "jwt" },

  pages: { signIn: "/" },

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id   = user.id
        token.role = user.role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id   = token.id   as string
        session.user.role = token.role as string
      }
      return session
    },
  },
})
