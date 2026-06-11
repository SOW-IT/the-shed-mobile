import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { IMPORT_DATA } from "./importData";
import { rolesOf } from "./model";

/**
 * One person's staffProfiles rows across every year and email they've held
 * (followed via importId, like profile.get). For checking imported history
 * from the CLI:
 *   npx convex run importHistory:personHistory '{"email":"someone@sow.org.au"}'
 */
export const personHistory = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const byEmail = await ctx.db
      .query("staffProfiles")
      .withIndex("by_email_and_year", (q) => q.eq("email", email))
      .take(50);
    const rows = new Map(byEmail.map((h) => [h._id, h]));
    const importIds = new Set(byEmail.flatMap((h) => (h.importId ? [h.importId] : [])));
    for (const importId of importIds) {
      const imported = await ctx.db
        .query("staffProfiles")
        .withIndex("by_importId", (q) => q.eq("importId", importId))
        .take(50);
      for (const h of imported) rows.set(h._id, h);
    }
    return [...rows.values()]
      .sort((a, b) => a.year - b.year)
      .map((h) => ({
        year: h.year,
        email: h.email,
        roles: rolesOf(h),
        department: h.department ?? null,
        division: h.division ?? null,
        university: h.university ?? null,
      }));
  },
});

/**
 * Re-keys one staff year's emails from the old Workspace domain to the new
 * one (same local part): staff profiles, department heads, the Budget
 * Manager and that year's requests. Profiles that would collide with an
 * existing row on the new domain are dropped in favour of the existing row.
 *
 * Run with:
 *   npx convex run importHistory:migrateEmailDomain \
 *     '{"year":2026,"fromDomain":"sowaustralia.com","toDomain":"sow.org.au"}'
 */
export const migrateEmailDomain = internalMutation({
  args: { year: v.number(), fromDomain: v.string(), toDomain: v.string() },
  handler: async (ctx, args) => {
    const move = (email: string | undefined): string | null => {
      if (!email || !email.endsWith(`@${args.fromDomain}`)) return null;
      return `${email.split("@")[0]}@${args.toDomain}`;
    };
    const counts = {
      profiles: 0,
      merged: 0,
      departments: 0,
      divisions: 0,
      budgetManagers: 0,
      requests: 0,
    };

    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(1000);
    for (const profile of profiles) {
      const email = move(profile.email);
      if (!email) continue;
      const existing = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", email).eq("year", args.year)
        )
        .unique();
      if (existing) {
        // The admin-maintained row wins, but keep the person linkage the
        // imported row carried so their other years still connect.
        await ctx.db.delete("staffProfiles", profile._id);
        await ctx.db.patch("staffProfiles", existing._id, {
          importId: existing.importId ?? profile.importId,
          name: existing.name ?? profile.name,
        });
        counts.merged++;
      } else {
        await ctx.db.patch("staffProfiles", profile._id, { email });
        counts.profiles++;
      }
    }

    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    for (const department of departments) {
      const headEmail = move(department.headEmail);
      if (headEmail) {
        await ctx.db.patch("departments", department._id, { headEmail });
        counts.departments++;
      }
    }

    const divisions = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    for (const division of divisions) {
      const headEmail = move(division.headEmail);
      if (headEmail) {
        await ctx.db.patch("divisions", division._id, { headEmail });
        counts.divisions++;
      }
    }

    const settings = await ctx.db
      .query("yearSettings")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .unique();
    const budgetManagerEmail = move(settings?.budgetManagerEmail);
    if (settings && budgetManagerEmail) {
      await ctx.db.patch("yearSettings", settings._id, { budgetManagerEmail });
      counts.budgetManagers++;
    }

    const requests = await ctx.db
      .query("requests")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(2000);
    for (const request of requests) {
      const requesterEmail = move(request.requesterEmail);
      if (requesterEmail) {
        await ctx.db.patch("requests", request._id, { requesterEmail });
        counts.requests++;
      }
    }

    return counts;
  },
});

/**
 * Fills every year's org structure and people from the old web app's
 * Firestore backup (see scripts/build-import-data.py for how importData.ts
 * is generated). Idempotent: everything upserts by its natural key
 * (year+name, email+year), so re-running or running after manual edits is
 * safe — backup data wins for the fields it carries.
 *
 * Run with: npx convex run importHistory:run
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const counts = { divisions: 0, departments: 0, universities: 0, profiles: 0, budgetManagers: 0 };

    for (const yearData of IMPORT_DATA.years) {
      const year = yearData.year;

      for (const division of yearData.divisions) {
        const existing = await ctx.db
          .query("divisions")
          .withIndex("by_year_and_name", (q) =>
            q.eq("year", year).eq("name", division.name)
          )
          .unique();
        if (existing) {
          await ctx.db.patch("divisions", existing._id, {
            headEmail: division.headEmail,
          });
        } else {
          await ctx.db.insert("divisions", {
            year,
            name: division.name,
            headEmail: division.headEmail,
          });
          counts.divisions++;
        }
      }

      for (const name of yearData.universities) {
        const existing = await ctx.db
          .query("universities")
          .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", name))
          .unique();
        if (!existing) {
          await ctx.db.insert("universities", { year, name });
          counts.universities++;
        }
      }

      for (const department of yearData.departments) {
        const fields = {
          division: department.division,
          headEmail: department.headEmail,
          colour: department.colour,
        };
        const existing = await ctx.db
          .query("departments")
          .withIndex("by_year_and_name", (q) =>
            q.eq("year", year).eq("name", department.name)
          )
          .unique();
        if (existing) {
          await ctx.db.patch("departments", existing._id, fields);
        } else {
          await ctx.db.insert("departments", { year, name: department.name, ...fields });
        }
        counts.departments++;
      }

      for (const profile of yearData.profiles) {
        const fields = {
          roles: profile.roles ?? [],
          role: undefined, // retire the legacy single-role field if present
          department: profile.department,
          division: profile.division,
          university: profile.university,
          name: profile.name,
          importId: profile.importId,
        };
        // Sign-ins re-key a person's live email, so match by the person key
        // first — re-imports must update that row (keeping the newer email),
        // never insert a second copy of the person under the backup email.
        const byPerson = await ctx.db
          .query("staffProfiles")
          .withIndex("by_importId", (q) => q.eq("importId", profile.importId))
          .take(100);
        const existing =
          byPerson.find((p) => p.year === year) ??
          (await ctx.db
            .query("staffProfiles")
            .withIndex("by_email_and_year", (q) =>
              q.eq("email", profile.email).eq("year", year)
            )
            .unique());
        if (existing) {
          await ctx.db.patch("staffProfiles", existing._id, fields);
        } else {
          await ctx.db.insert("staffProfiles", { email: profile.email, year, ...fields });
        }
        counts.profiles++;
      }

      if (yearData.budgetManagerEmail) {
        const settings = await ctx.db
          .query("yearSettings")
          .withIndex("by_year", (q) => q.eq("year", year))
          .unique();
        if (settings) {
          await ctx.db.patch("yearSettings", settings._id, {
            budgetManagerEmail: yearData.budgetManagerEmail,
          });
        } else {
          await ctx.db.insert("yearSettings", {
            year,
            budgetManagerEmail: yearData.budgetManagerEmail,
          });
        }
        counts.budgetManagers++;
      }
    }

    return counts;
  },
});
