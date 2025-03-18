import { Prisma } from "@prisma/client";
import { z } from "zod";
import { Resend } from 'resend';
import { env } from "~/env";

// Initialize Resend
const resend = new Resend(env.RESEND_API_KEY);

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const postRouter = createTRPCRouter({
  hello: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.text}`,
      };
    }),

  create: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.post.create({
        data: {
          name: input.name,
        },
      });
    }),

  getLatest: publicProcedure.query(async ({ ctx }) => {
    const post = await ctx.db.post.findFirst({
      orderBy: { createdAt: "desc" },
    });

    return post ?? null;
  }),

  subscribeEmail: publicProcedure
    .input(z.object({ 
      email: z.string()
        .email()
        .transform(email => email.toLowerCase().trim()) // Normalize email
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Check if email already exists (case-insensitive)
        const existingSubscriber = await ctx.db.subscriber.findUnique({
          where: {
            email: input.email, // Already normalized above
          },
        });

        if (existingSubscriber) {
          throw new Error('This email is already subscribed');
        }

        // Create subscriber in database
        const subscriber = await ctx.db.subscriber.create({
          data: {
            email: input.email,
          },
        });

        // Send welcome email
        await resend.emails.send({
          from: 'Your Company <onboarding@resend.dev>',
          to: input.email,
          subject: 'Welcome to Our Newsletter!',
          html: `
            <h1>Welcome to Our Newsletter!</h1>
            <p>Thank you for subscribing to our newsletter. We're excited to have you on board!</p>
            <p>You'll start receiving our updates soon.</p>
          `
        });

        return { success: true, subscriber };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new Error('This email is already subscribed');
        }
        throw error;
      }
    }),
});
