import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "openai",
      name: "OpenAI",
      type: "oauth",
      issuer: process.env.OPENAI_OAUTH_ISSUER,
      clientId: process.env.OPENAI_OAUTH_CLIENT_ID || "",
      clientSecret: process.env.OPENAI_OAUTH_CLIENT_SECRET || "",
      authorization: process.env.OPENAI_OAUTH_AUTH_URL
        ? { url: process.env.OPENAI_OAUTH_AUTH_URL, params: { scope: "openid profile email" } }
        : undefined,
      token: process.env.OPENAI_OAUTH_TOKEN_URL
        ? { url: process.env.OPENAI_OAUTH_TOKEN_URL }
        : undefined,
      userinfo: process.env.OPENAI_OAUTH_USERINFO_URL
        ? { url: process.env.OPENAI_OAUTH_USERINFO_URL }
        : undefined,
      profile(profile: any) {
        return {
          id: profile.sub || profile.id || "openai-user",
          name: profile.name || profile.email || "OpenAI User",
          email: profile.email,
          image: profile.picture,
        };
      },
    } as any,
  ],
  session: { strategy: "jwt" },
};
