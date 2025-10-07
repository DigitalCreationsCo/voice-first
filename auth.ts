import NextAuth from "next-auth"
import "next-auth/jwt"
import Google from "next-auth/providers/google"
import { createStorage } from "unstorage"
import memoryDriver from "unstorage/drivers/memory"
import vercelKVDriver from "unstorage/drivers/vercel-kv"
import { UnstorageAdapter } from "@auth/unstorage-adapter"
import { createUser, getUser } from "@/db/queries"

const storage = createStorage({
  driver: process.env.VERCEL
    ? vercelKVDriver({
        url: process.env.AUTH_KV_REST_API_URL,
        token: process.env.AUTH_KV_REST_API_TOKEN,
        env: false,
      })
    : memoryDriver(),
})

export const { handlers: { GET, POST }, auth, signIn, signOut } = NextAuth({
  debug: process.env.NODE_ENV !== 'production',
  theme: { logo: "https://authjs.dev/img/logo-sm.png" },
  adapter: UnstorageAdapter(storage),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  trustHost: process.env.TRUST_HOST === "true",
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      console.log('signIn callback, user: ', user);
      const userExists = await getUser(user.email!);
      console.log('user exists in database: ', userExists);
      if (!userExists) {
        await createUser(user.email!, '');
      }
      return true;
    },
    
    authorized({ request, auth }) {
      console.log('authorized callback, auth: ', auth);
      // console.log('request: ', request);
      const { pathname } = request.nextUrl
      if (pathname === "/middleware-example") return !!auth
      return true
    },

    async jwt({ user, token, trigger, session, account }) {
      console.log('jwt callback');
      console.log('token: ', token);
      if (user?.email) {
        const dbUser = await getUser(user.email)
        if (dbUser) token.userId = dbUser.id
      }

      if (trigger === "update") token.name = session.user.name
      if (account?.provider === "keycloak") {
        return { ...token, accessToken: account.access_token }
      }
      return token
    },

    async session({ session, token }) {
      console.log('session callback, session: ', session);
      console.log('token: ', token);
      if (token?.accessToken) session.accessToken = token.accessToken;
      if (token?.userId) session.user.id = token.userId as string;
      return session
    },
  },
})

declare module "next-auth" {
  interface Session {
    accessToken?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string
  }
}
