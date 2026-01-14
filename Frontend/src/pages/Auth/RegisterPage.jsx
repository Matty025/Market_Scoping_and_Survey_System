// ===== LIBRARIES =====
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";

// ===== COMPONENTS =====
import Toast from "../../components/Toast";
import CategoryModal from "../../components/CategoryModal";

// ===== STYLES =====
import "./RegisterPage.css";

// ===== CUSTOM HOOK =====
const useRegistrationForm = () => {
  const navigate = useNavigate();
  // Using centralized `api` (baseURL comes from `import.meta.env.VITE_API_URL` at build time)

  const initialFormData = {
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    address: "",
    contactNumber: "",
    hasPhilgeps: false,
    hasSecRegistration: false,
    hasBusinessPermit: false,
    hasTaxClearance: false,
    selectedCategories: [],
  };

  const [role, setRole] = useState("supplier");
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryGroups, setCategoryGroups] = useState([]);
  const [toast, setToast] = useState({ visible: false, type: "info", message: "" });
  const [verifyStatus, setVerifyStatus] = useState("idle"); // idle | sending | sent | verified | error
  const [preToken, setPreToken] = useState("");
  const [sendDisableUntil, setSendDisableUntil] = useState(0);
  const [checkDisableUntil, setCheckDisableUntil] = useState(0);
  const [autoPollCount, setAutoPollCount] = useState(0);

  // Hydrate form (except passwords) from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("registerForm");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.role) setRole(parsed.role);
        if (parsed.formData) {
          setFormData(prev => ({ ...prev, ...parsed.formData, password: "", confirmPassword: "" }));
        }
      }
    } catch (e) {
      console.warn("[register] failed to hydrate form", e);
    }
  }, []);

  // Persist form (except passwords) to sessionStorage on change
  useEffect(() => {
    const payload = {
      role,
      formData: { ...formData, password: "", confirmPassword: "" },
    };
    try {
      sessionStorage.setItem("registerForm", JSON.stringify(payload));
    } catch (e) {
      console.warn("[register] failed to persist form", e);
    }
  }, [role, formData]);

  // ===== TOAST =====
  const showToast = (type, message, duration = 3000) => {
    setToast({ visible: true, type, message });
    setTimeout(() => setToast({ visible: false, type: "info", message: "" }), duration);
  };

  const hideToast = () => setToast({ ...toast, visible: false });

  // ===== FETCH CATEGORIES =====
  useEffect(() => {
    if (role !== "supplier") return;

    const fetchCategories = async () => {
      try {
        const res = await api.get(`/api/public/categories`);
        const data = res?.data;

        if (!data || !Array.isArray(data)) {
          console.warn("Unexpected categories response:", data);
          showToast("error", "Failed to load categories. Try again.");
          return;
        }

        let formatted = [];

        // Case A: API returns grouped categories: [{ name, options: [{CategoryName, CategoryID}, ...] }, ...]
        if (data.length > 0 && data[0] && Array.isArray(data[0].options)) {
          formatted = data.map(group => ({
            label: group.name || group.label || "Group",
            options: (group.options || [])
              .filter(cat => cat && (cat.CategoryID ?? cat.value) != null && (cat.ParentCategoryID ?? true) !== null)
              .map(cat => ({
                label: cat.CategoryName || cat.label || "",
                value: cat.CategoryID ?? cat.value,
              })),
          }));
        } else {
          // Case B: API returns a flat array of categories: [{ CategoryID, CategoryName, ParentCategoryID }, ...]
          // Exclude top-level parents (ParentCategoryID === null) so they are not selectable
          const childOnly = data.filter(cat => cat && (cat.ParentCategoryID !== null && cat.ParentCategoryID !== undefined));
          formatted = [
            {
              label: "All Categories",
              options: childOnly.map(cat => ({ label: cat.CategoryName || cat.label || "", value: cat.CategoryID ?? cat.value })),
            },
          ];
        }

        setCategoryGroups(formatted);
      } catch (err) {
        console.error(err);
        showToast("error", "Failed to load categories. Try again.");
      }
    };

    fetchCategories();
  }, [role]);

  // ===== HANDLERS =====
  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleCategoryChange = selectedValues => {
    setFormData(prev => ({ ...prev, selectedCategories: selectedValues }));
  };

  const validate = () => {
    const email = formData.email.trim();

    if (!formData.fullName.trim()) return "Full name is required.";
    if (!email) return "Email is required.";
    if (!/.+@.+\..+/.test(email)) return "Enter a valid email address.";
    if (!formData.password) return "Password is required.";
    if (formData.password.length < 6) return "Password must be at least 6 characters long.";
    if (formData.password !== formData.confirmPassword) return "Passwords do not match.";

    if (role === "supplier") {
      if (!formData.companyName.trim()) return "Company name is required.";
      if (!formData.address.trim()) return "Address is required.";
      if (!formData.contactNumber.trim()) return "Contact number is required.";
    }

    return "";
  };

  const handleSendPreVerify = async () => {
    const email = formData.email.trim();
    if (!email) return showToast("error", "Email is required first.");
    if (!/.+@.+\..+/.test(email)) return showToast("error", "Enter a valid email address.");

    if (Date.now() < sendDisableUntil) {
      const seconds = Math.ceil((sendDisableUntil - Date.now()) / 1000);
      return showToast("error", `Please wait ${seconds}s before resending.`);
    }

    setVerifyStatus("sending");
    try {
      const res = await api.post("/auth/pre-verify/send", { email });
      setPreToken(res.data?.preToken || "");
      setVerifyStatus("sent");
      setSendDisableUntil(Date.now() + 60 * 1000);
      showToast("success", "Verification email sent. Check your Gmail inbox (and Spam) and make sure the address is valid.");
      setAutoPollCount(0);
    } catch (err) {
      const retry = err?.response?.data?.retryInSeconds;
      if (retry) setSendDisableUntil(Date.now() + retry * 1000);
      const msg = err?.response?.data?.error || err?.response?.data?.message || "Failed to send verification email.";
      setVerifyStatus("error");
      showToast("error", msg);
    }
  };

  const checkVerificationStatus = useCallback(async ({ silent = false, enforceCooldown = true } = {}) => {
    if (!preToken) {
      if (!silent) showToast("error", "Send a verification email first.");
      return false;
    }
    if (enforceCooldown && Date.now() < checkDisableUntil) {
      const seconds = Math.ceil((checkDisableUntil - Date.now()) / 1000);
      if (!silent) showToast("error", `Please wait ${seconds}s before refreshing status.`);
      return false;
    }
    try {
      const res = await api.get(`/auth/pre-verify/status`, { params: { token: preToken } });
      if (res.data?.verified) {
        setVerifyStatus("verified");
        if (!silent) showToast("success", "Email verified. You can finish registration now.");
        return true;
      }
      setVerifyStatus("sent");
      if (!silent) {
        showToast("error", "Not verified yet. Please click the email link. If you've clicked it, wait a few seconds or resend.");
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || "Verification check failed.";
      setVerifyStatus("error");
      if (!silent) showToast("error", msg);
    } finally {
      setCheckDisableUntil(Date.now() + 5000);
    }
    return false;
  }, [preToken, checkDisableUntil]);

  const handleCheckVerified = () => checkVerificationStatus({ silent: false, enforceCooldown: true });

  const handleFinalSubmit = async e => {
    // Ant Design Form `onFinish` passes form values, not an event.
    // Handle both cases: a DOM event (from a native form/button) or form values object.
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    } else if (e && typeof e === "object" && Array.isArray(e.categories)) {
      // update selected categories from form values if provided
      setFormData(prev => ({ ...prev, selectedCategories: e.categories }));
    }

    if (role === "supplier" && formData.selectedCategories.length === 0) {
      showToast("error", "Please select at least one category.");
      return;
    }

    const error = validate();
    if (error) return showToast("error", error);

    if (verifyStatus !== "verified") {
      return showToast("error", "Please verify your email before registering.");
    }

    setIsSubmitting(true);

    try {
      let payload = {
        role,
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
        password: formData.password,
        preverifyToken: preToken,
      };

      if (role === "supplier") {
        payload = {
          ...payload,
          companyName: formData.companyName.trim(),
          address: formData.address.trim(),
          contactNumber: formData.contactNumber.trim(),
          hasPhilgeps: formData.hasPhilgeps,
          hasSecRegistration: formData.hasSecRegistration,
          hasBusinessPermit: formData.hasBusinessPermit,
          hasTaxClearance: formData.hasTaxClearance,
          categories: formData.selectedCategories,
        };
      }

      const res = await api.post(`/auth/register`, payload);
      showToast("success", res.data?.message || `${role} registered successfully.`);
      setFormData(initialFormData);
      setTimeout(() => navigate("/"), 800);
    } catch (err) {
      let msg = err?.response?.data?.message || "Registration failed. Try again.";
      if (err?.response?.status === 409) msg = "Email already in use.";
      showToast("error", msg);
    } finally {
      setIsSubmitting(false);
      setIsCategoryModalOpen(false);
    }
  };

  const handleInitialRegister = e => {
    e.preventDefault();
    const error = validate();
    if (error) return showToast("error", error);

    if (role === "supplier") setIsCategoryModalOpen(true);
    else handleFinalSubmit(e);
  };

  return {
    role,
    setRole,
    formData,
    handleChange,
    handleCategoryChange,
    isSubmitting,
    toast,
    hideToast,
    handleInitialRegister,
    isCategoryModalOpen,
    setIsCategoryModalOpen,
    handleFinalSubmit,
    categoryGroups,
    navigate,
    verifyStatus,
    handleSendPreVerify,
    handleCheckVerified,
    preToken,
    checkVerificationStatus,
    autoPollCount,
    setAutoPollCount,
  };
};

// Auto-poll verification status after sending, up to 12 attempts (~60s) to reduce clicks
const useAutoPollVerification = (verifyStatus, preToken, checkFn, autoPollCount, setAutoPollCount) => {
  useEffect(() => {
    if (verifyStatus !== "sent" || !preToken) return;
    if (autoPollCount >= 12) return; // stop after ~1 minute

    const id = setInterval(async () => {
      const ok = await checkFn({ silent: true, enforceCooldown: false });
      if (ok) {
        clearInterval(id);
        return;
      }
      setAutoPollCount((c) => c + 1);
    }, 5000);

    return () => clearInterval(id);
  }, [verifyStatus, preToken, checkFn, autoPollCount, setAutoPollCount]);
};

// ===== SUB-COMPONENTS =====
const RoleToggle = ({ role, setRole }) => (
  <div className="role-toggle">
    {["supplier", "buyer"].map(r => (
      <button key={r} className={role === r ? "active" : ""} type="button" onClick={() => setRole(r)}>
        {r.toUpperCase()}
      </button>
    ))}
  </div>
);

const UserInputs = ({ formData, handleChange, role, verifyStatus, onSendVerify, onCheckVerify, preToken }) => (
  <>
    <input type="text" name="fullName" placeholder={role === "supplier" ? "Contact Person Full Name" : "Full Name"} value={formData.fullName} onChange={handleChange} required />
    <div className="email-verify-row">
      <input type="email" name="email" placeholder="Email Address" value={formData.email} onChange={handleChange} required />
      <button type="button" className="verify-btn" onClick={onSendVerify} disabled={verifyStatus === "sending" || verifyStatus === "verified"}>
        {verifyStatus === "sending" ? "Sending..." : verifyStatus === "verified" ? "Email Verified" : "Verify Email"}
      </button>
      <button type="button" className="verify-btn secondary" onClick={onCheckVerify} disabled={!preToken || verifyStatus === "verified"}>
        {verifyStatus === "verified" ? "Verified" : "Refresh status"}
      </button>
    </div>
    {verifyStatus !== "idle" && (
      <p className="verify-guide">
        Check your Gmail inbox and spam for the verification link. Make sure you entered a valid Gmail address; the link expires in 24 hours.
      </p>
    )}
    <input type="password" name="password" placeholder="Password" value={formData.password} onChange={handleChange} required />
    <input type="password" name="confirmPassword" placeholder="Confirm Password" value={formData.confirmPassword} onChange={handleChange} required />
  </>
);

const SupplierInputs = ({ formData, handleChange }) => (
  <>
    <input type="text" name="companyName" placeholder="Company Name" value={formData.companyName} onChange={handleChange} required />
    <input type="text" name="address" placeholder="Address" value={formData.address} onChange={handleChange} required />
    <input type="text" name="contactNumber" placeholder="Contact Number" value={formData.contactNumber} onChange={handleChange} required />
  </>
);

const DocumentChecks = ({ formData, handleChange }) => {
  const docs = [
    { key: "hasPhilgeps", label: "PhilGEPS Registration" },
    { key: "hasSecRegistration", label: "SEC Registration" },
    { key: "hasBusinessPermit", label: "Business Permit" },
    { key: "hasTaxClearance", label: "Tax Clearance" },
  ];

  return (
    <div className="document-section">
      <h3>Required Documents Checklist Guide</h3>
      <div className="checkboxes">
        {docs.map(d => (
          <label key={d.key}>
            <input type="checkbox" name={d.key} checked={!!formData[d.key]} onChange={handleChange} />
            {d.label}
          </label>
        ))}
      </div>
      <p className="document-contact">Submit documents or inquiries to <strong>procurement@msss.gov</strong>.</p>
    </div>
  );
};

// ===== MAIN COMPONENT =====
export default function RegisterPage() {
  const {
    role,
    setRole,
    formData,
    handleChange,
    handleCategoryChange,
    isSubmitting,
    toast,
    hideToast,
    handleInitialRegister,
    isCategoryModalOpen,
    setIsCategoryModalOpen,
    handleFinalSubmit,
    categoryGroups,
    navigate,
    verifyStatus,
    handleSendPreVerify,
    handleCheckVerified,
    preToken,
    checkVerificationStatus,
    autoPollCount,
    setAutoPollCount,
  } = useRegistrationForm();

  useAutoPollVerification(verifyStatus, preToken, checkVerificationStatus, autoPollCount, setAutoPollCount);

  return (
    <div className="register-card">
      <Toast type={toast.type} message={toast.message} visible={toast.visible} onClose={hideToast} />

      <h1 className="register-title">{role === "supplier" ? "Supplier" : "Buyer"} Registration</h1>

      <RoleToggle role={role} setRole={setRole} />

      <form onSubmit={handleInitialRegister}>
        <div className="input-group">
          <UserInputs
            formData={formData}
            handleChange={handleChange}
            role={role}
            verifyStatus={verifyStatus}
            onSendVerify={handleSendPreVerify}
            onCheckVerify={handleCheckVerified}
            preToken={preToken}
          />
          {role === "supplier" && <SupplierInputs formData={formData} handleChange={handleChange} />}
        </div>

        {role === "supplier" && <DocumentChecks formData={formData} handleChange={handleChange} />}

        <div className="action-buttons">
          <button type="submit" disabled={isSubmitting} className="register-btn">
            {isSubmitting ? "Validating..." : (role === "supplier" ? "Next: Select Categories" : "Register")}
          </button>
          <button type="button" className="cancel-btn" onClick={() => navigate("/")}>Cancel</button>
        </div>
      </form>

      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSubmit={handleFinalSubmit}
        categoryGroups={categoryGroups}
        selectedCategories={formData.selectedCategories}
        handleChange={handleCategoryChange}
        isSubmitting={isSubmitting}
      />

      <p className="login-link">
        Already have an account? <button onClick={() => navigate("/")}>Login</button>
      </p>
    </div>
  );
}
