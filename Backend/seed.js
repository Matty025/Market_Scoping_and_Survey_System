const pool = require("./db.js");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

// Hierarchical category data structure
const categories = [
  {
    name: 'GOODS',
    children: [
      "Office Supplies & Devices", "IT Equipment & Peripherals", "Educational & Instructional Materials",
      "Furniture & Fixtures", "Sports & Physical Education Equipment", "Laboratory Equipment & Supplies",
      "Electrical & Electronic Supplies", "Cleaning & Janitorial Supplies", "Medical & First Aid Supplies",
      "Vehicles, Tools & Machinery", "Printing & Reproduction Services", "Uniforms, Apparel & Fabrics",
      "Food & Catering Supplies", "General Support Services"
    ]
  },
  {
    name: 'INFRASTRUCTURE PROJECTS',
    children: [
      "School Building Construction", "School Building Rehabilitation", "Water Supply & Sanitation Systems",
      "Electrical & Power Systems", "Site Development & Landscaping", "Roofing and Painting Works",
      "Minor Repairs & Maintenance Work"
    ]
  },
  {
    name: 'CONSULTING SERVICES',
    children: [
      "Architectural & Engineering Design", "Feasibility & Project Studies", "Construction Supervision",
      "ICT System Development", "Research & Evaluation Studies"
    ]
  }
];

const seedCategories = async () => {
  const client = await pool.connect();
  console.log("Seeding hierarchical categories into the database...");

  try {
    await client.query('BEGIN');

    for (const parent of categories) {
      // Insert the parent category and get its ID
      const parentQuery = `
        INSERT INTO "Categories" ("CategoryName", "ParentCategoryID")
        VALUES ($1, NULL)
        ON CONFLICT ("CategoryName") DO UPDATE SET "CategoryName" = EXCLUDED."CategoryName"
        RETURNING "CategoryID";
      `;
      const parentResult = await client.query(parentQuery, [parent.name]);
      const parentId = parentResult.rows[0].CategoryID;
      console.log(`Upserted parent category '${parent.name}' with ID: ${parentId}`);

      if (parent.children && parent.children.length > 0) {
        // Insert all children linked to the parent ID
        const childrenQuery = `
          INSERT INTO "Categories" ("CategoryName", "ParentCategoryID")
          SELECT * FROM UNNEST($1::text[], $2::int[])
          ON CONFLICT ("CategoryName") DO NOTHING;
        `;
        const childNames = parent.children;
        const parentIds = Array(childNames.length).fill(parentId);
        await client.query(childrenQuery, [childNames, parentIds]);
        console.log(`  -> Upserted ${childNames.length} child categories.`);
      }
    }

    await client.query('COMMIT');
    console.log("✅ Hierarchical categories seeded successfully.");
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Error seeding categories:", error);
  } finally {
    client.release();
    await pool.end();
  }
};

seedCategories();