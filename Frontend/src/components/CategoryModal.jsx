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

  // Build a mapping of main categories -> parent category IDs
  const PRESETS = useMemo(() => {
    const mapping = {};
    (categoryGroups || []).forEach(group => {
      group.options?.forEach(opt => {
        if (opt.label && opt.parentLabel) {
          if (!mapping[opt.parentLabel]) mapping[opt.parentLabel] = [];
          mapping[opt.parentLabel].push(opt.value);
        }
      });
    });
    return mapping;
  }, [categoryGroups]);

  // Fallback for old data if parentLabel is not provided
  // You can remove this if your API already provides parent info
  const FALLBACK_PRESETS = useMemo(() => ({
    Goods: categoryGroups.flatMap(g =>
      g.options?.filter(o =>
        ["Office Supplies", "IT Equipment", "Educational & Instructional Materials",
         "Furniture & Fixtures", "Sports & Physical Education Equipment",
         "Laboratory Equipment & Supplies", "Electrical & Electronic Supplies",
         "Cleaning & Janitorial Supplies", "Medical & First Aid Supplies",
         "Vehicles, Tools & Machinery", "Printing & Reproduction Services",
         "Uniforms, Apparel & Fabrics", "Food & Catering Supplies",
         "General Support Services"].includes(o.label)
      ).map(o => o.value) || []
    ),
    "Infrastructure Projects": categoryGroups.flatMap(g =>
      g.options?.filter(o =>
        ["School Building Construction", "School Building Rehabilitation",
         "Water Supply & Sanitation Systems", "Electrical & Power Systems",
         "Site Development & Landscaping", "Roofing and Painting Works",
         "Minor Repairs & Maintenance Work"].includes(o.label)
      ).map(o => o.value) || []
    ),
    "Consulting Services": categoryGroups.flatMap(g =>
      g.options?.filter(o =>
        ["Architectural & Engineering Design", "Feasibility & Project Studies",
         "Construction Supervision", "ICT System Development",
         "Research & Evaluation Studies"].includes(o.label)
      ).map(o => o.value) || []
    ),
  }), [categoryGroups]);

  const combinedPresets = { ...PRESETS, ...FALLBACK_PRESETS };

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
        <div
          className="preset-buttons"
          style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          {Object.keys(combinedPresets).map(p => {
            const matchedValues = combinedPresets[p] || [];
            const isActive =
              matchedValues.length > 0 &&
              matchedValues.every(v => (selectedCategories || []).includes(v));

            return (
              <button
                key={p}
                type="button"
                className={`preset-btn ${isActive ? "active" : ""}`}
                onClick={() => {
                  if (!matchedValues || matchedValues.length === 0) return;

                  let newSelection = Array.isArray(selectedCategories)
                    ? [...selectedCategories]
                    : [];
                  if (isActive) {
                    newSelection = newSelection.filter(v => !matchedValues.includes(v));
                  } else {
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
            getPopupContainer={triggerNode => triggerNode.parentNode}
            options={categoryGroups}
            optionFilterProp="label"
            filterSort={(optionA, optionB) =>
              (optionA?.label ?? "").toLowerCase().localeCompare(
                (optionB?.label ?? "").toLowerCase()
              )
            }
            notFoundContent={<div>No categories available</div>}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CategoryModal;
