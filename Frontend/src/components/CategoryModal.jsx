import React, { useMemo } from "react";
import { Modal, Select, Form, Button } from "antd";
import "antd/dist/reset.css";
import "./CategoryModal.css";

const CategoryModal = ({
  isOpen,
  onClose,
  onSubmit,
  categoryGroups = [], // default to empty array
  selectedCategories,
  handleChange,
  isSubmitting,
}) => {
  const [form] = Form.useForm();

  // Preset main categories -> list of known subcategory labels / keywords
  const PRESETS = useMemo(() => ({
    Goods: [
      "Office Supplies",
      "Office Supplies & Devices",
      "IT Equipment",
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
    ],
    "Infrastructure Projects": [
      // put known infra-related keywords (flexible matching)
      "infrastructure",
      "project",
      "construction",
    ],
    "Consulting Services": [
      "consult",
      "services",
      "consulting",
    ],
  }), []);

  return (
    <Modal
      title="Select Your Business Categories"
      open={isOpen}
      onCancel={onClose}
      footer={[
        <Button key="back" onClick={onClose} disabled={isSubmitting}>
          Back
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={isSubmitting}
          onClick={() => form.submit()}
        >
          {isSubmitting ? "Submitting..." : "Confirm & Register"}
        </Button>,
      ]}
    >
      <p>Please select all categories that apply.</p>
      <Form form={form} onFinish={onSubmit} layout="vertical" name="category_form">
        <div className="preset-buttons" style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.keys(PRESETS).map(p => {
            // determine if preset is already fully selected
            const allOptionValues = (categoryGroups || []).flatMap(g => (g.options || []).map(o => o.value));
            const matchedValues = (categoryGroups || [])
              .flatMap(g => (g.options || []))
              .filter(o => {
                const label = (o.label || o.CategoryName || "").toString().toLowerCase();
                return PRESETS[p].some(k => label.includes(k.toLowerCase()));
              })
              .map(o => o.value);

            const isActive = matchedValues.length > 0 && matchedValues.every(v => (selectedCategories || []).includes(v));

            return (
              <button
                key={p}
                type="button"
                className={`preset-btn ${isActive ? "active" : ""}`}
                onClick={() => {
                  if (!matchedValues || matchedValues.length === 0) return;

                  // If active -> remove these from selection (toggle); otherwise merge them in
                  let newSelection = Array.isArray(selectedCategories) ? [...selectedCategories] : [];
                  if (isActive) {
                    newSelection = newSelection.filter(v => !matchedValues.includes(v));
                  } else {
                    // merge unique
                    const set = new Set(newSelection.concat(matchedValues));
                    newSelection = Array.from(set);
                  }

                  form.setFieldsValue({ categories: newSelection });
                  handleChange(newSelection);
                }}
                disabled={isSubmitting}
                style={{ padding: "6px 10px", cursor: "pointer" }}
              >
                {p}
              </button>
            );
          })}
        </div>
        <Form.Item
          name="categories"
          rules={[{ required: true, message: "Please select at least one category." }]}
        >
          <Select
            mode="multiple"
            allowClear
            style={{ width: "100%" }}
            placeholder="Please select categories"
            value={selectedCategories}
            onChange={handleChange}
            // This is the key to fixing the dropdown appearing behind the modal
            getPopupContainer={(triggerNode) => triggerNode.parentNode}
            options={categoryGroups}
            optionFilterProp="label"
            filterSort={(optionA, optionB) =>
              (optionA?.label ?? '').toLowerCase().localeCompare((optionB?.label ?? '').toLowerCase())
            }
            notFoundContent={<div>No categories available</div>}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CategoryModal;
