import { internalMutation } from "./_generated/server";
import { IMPORT_DATA } from "./importData";

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

      for (const name of yearData.divisions) {
        const existing = await ctx.db
          .query("divisions")
          .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", name))
          .unique();
        if (!existing) {
          await ctx.db.insert("divisions", { year, name });
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
        const existing = await ctx.db
          .query("staffProfiles")
          .withIndex("by_email_and_year", (q) =>
            q.eq("email", profile.email).eq("year", year)
          )
          .unique();
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
