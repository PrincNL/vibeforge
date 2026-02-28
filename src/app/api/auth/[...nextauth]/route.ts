import NextAuth from "next-auth";
import { getAuthOptions } from "@/lib-auth";

const handler = (req: Request, ctx: any) => {
  const authHandler = NextAuth(getAuthOptions());
  return authHandler(req as any, ctx);
};

export { handler as GET, handler as POST };
