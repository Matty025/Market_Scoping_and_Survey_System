const pool = require("./pool"); // We'll create this file next
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

// A standardized list of procurement categories
const categories = [
  "Office Supplies & Devices",
  "IT Equipment & Peripherals",
  "Educational & Instructional Materials",
  "Furniture & Fixtures",
  "Sports & Physical Education Equipment",
  "Laboratory Equipment & Supplies",
  "Electrical & Electronic Supplies",
  "Cleaning & Janitorial Supplies",
  "Medical & First Aid Supplies",
  "Vehicles, Tools & Machinery",
  "Printing & Reproduction Services",
  "Uniforms, Apparel & Fabrics",
  "Food & Catering Supplies",
  "General Support Services",
  "School Building Construction",
  "School Building Rehabilitation",
  "Water Supply & Sanitation Systems",
  "Electrical & Power Systems",
  "Site Development & Landscaping",
  "Architectural & Engineering Design",
  "Construction Supervision",
  "ICT System Development",
  "Research & Evaluation Studies",
];

const seedCategories = async () => {
  console.log("Seeding categories into the database...");
  try {
    const query = `INSERT INTO "Categories" ("CategoryName") SELECT * FROM UNNEST($1::text[]) ON CONFLICT ("CategoryName") DO NOTHING;`;
    await pool.query(query, [categories]);
    console.log("✅ Categories seeded successfully.");
  } catch (error) {
    console.error("❌ Error seeding categories:", error);
  } finally {
    await pool.end();
  }
};

seedCategories();