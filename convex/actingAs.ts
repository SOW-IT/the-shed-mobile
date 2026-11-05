import { ConvexError, v } from "convex/values";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { ADMIN_DEPARTMENTS, type RoleTitles } from "../shared/flow";
import {
  ALL_VIEWS,
  personaDepartment,
  personaLabel,
  SELF_LENS,
  type Lens,
  type Persona,
} from "../shared/actingAs";
import { personaValidator } from "./actingAsData";
import {
  getDepartment,
  isAdminProfile,
  optionalProfile,
  requireAdmin,
  type CallerContext,
} from "./model";

type Ctx = QueryCtx | MutationCtx;

const DEPARTMENTS_LIMIT = 200;

const choiceOf = (ctx: Ctx, email: string) =>
  ctx.db
    .query("actingAs")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

const departmentExists = async (ctx: Ctx, year: number, persona: Persona) => {
  const department = personaDepartment(persona);
  return department === null || (await getDepartment(ctx, year, department)) !== null;
};

async function chosenPersona(ctx: Ctx, caller: CallerContext): Promise<Persona | null> {
  const choice = await choiceOf(ctx, caller.email);
  if (!choice || !(await departmentExists(ctx, caller.year, choice.persona))) return null;
  return choice.persona;
}

export async function lensFor(
  ctx: Ctx,
  caller: CallerContext,
  isAdmin?: boolean
): Promise<Lens> {
  if (!(isAdmin ?? (await isAdminProfile(ctx, caller.profile)))) return SELF_LENS;
  const persona = await chosenPersona(ctx, caller);
  return persona ? { kind: "as", persona } : ALL_VIEWS;
}

export function personaIsAdmin(persona: Persona): boolean {
  const department = personaDepartment(persona);
  if (department === null) return persona.role === "director";
  return ADMIN_DEPARTMENTS.includes(department);
}

export async function viewsAsAdmin(ctx: Ctx, caller: CallerContext | null): Promise<boolean> {
  if (!caller) return false;
  const isAdmin = await isAdminProfile(ctx, caller.profile);
  const lens = await lensFor(ctx, caller, isAdmin);
  return lens.kind === "as" ? personaIsAdmin(lens.persona) : isAdmin;
}

export const actingAsView =(lens: Lens, titles?: RoleTitles) =>
  lens.kind === "self"
    ? null
    : lens.kind === "all"
      ? { persona: null, label: null }
      : { persona: lens.persona, label: personaLabel(lens.persona, titles) };

export const options = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller || !(await isAdminProfile(ctx, caller.profile))) return null;
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", caller.year))
      .take(DEPARTMENTS_LIMIT);
    return {
      year: caller.year,
      current: await chosenPersona(ctx, caller),
      departments: departments.map((d) => ({ name: d.name, division: d.division })),
    };
  },
});

export const set = mutation({
  args: { persona: v.union(personaValidator, v.null()) },
  returns: v.null(),
  handler: async (ctx, { persona }) => {
    const caller = await requireAdmin(ctx);
    if (persona && !(await departmentExists(ctx, caller.year, persona))) {
      throw new ConvexError(
        `There's no ${personaDepartment(persona)} department in ${caller.year}.`
      );
    }
    const choice = await choiceOf(ctx, caller.email);
    if (persona === null) {
      if (choice) await ctx.db.delete("actingAs", choice._id);
    } else if (choice) {
      await ctx.db.patch("actingAs", choice._id, { persona });
    } else {
      await ctx.db.insert("actingAs", { email: caller.email, persona });
    }
    return null;
  },
});
