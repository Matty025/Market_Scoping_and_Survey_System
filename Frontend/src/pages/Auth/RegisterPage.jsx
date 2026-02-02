// ===== LIBRARIES =====
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import { FaSyncAlt, FaEye, FaEyeSlash, FaCheckCircle } from "react-icons/fa"; // Added refresh + password toggle icons

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
  const [showRefresh, setShowRefresh] = useState(false);
  const [verifyInlineError, setVerifyInlineError] = useState("");
  const [blockedEmails, setBlockedEmails] = useState([]); // emails rejected this session
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [hasAgreedLegal, setHasAgreedLegal] = useState(false);
  const [hasScrolledLegal, setHasScrolledLegal] = useState(false);
  const legalBodyRef = useRef(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

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
    if (name === "email") {
      setVerifyStatus("idle");
      setPreToken("");
      setShowRefresh(false);
      setAutoPollCount(0);
      setVerifyInlineError("");
    }
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
    const emailKey = email.toLowerCase();
    if (blockedEmails.includes(emailKey)) {
      const msg = "This email was rejected earlier in this session. Please use a different email.";
      setVerifyInlineError(msg);
      setVerifyStatus("idle");
      setPreToken("");
      setShowRefresh(false);
      showToast("error", msg);
      return;
    }

    if (Date.now() < sendDisableUntil) {
      const seconds = Math.ceil((sendDisableUntil - Date.now()) / 1000);
      return showToast("error", `Please wait ${seconds}s before resending.`);
    }

    setVerifyStatus("sending");
    setVerifyInlineError("");
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
      let msg = err?.response?.data?.error || err?.response?.data?.message || "Failed to send verification email.";
      if (err?.response?.status === 409) {
        msg = "Email already in use. Please use a different email.";
        // Keep the verify button available for trying another address
        setVerifyStatus("idle");
        setSendDisableUntil(0);
        setPreToken("");
        setShowRefresh(false);
        setBlockedEmails(prev => (prev.includes(emailKey) ? prev : [...prev, emailKey]));
      }
      if (err?.response?.status !== 409) setVerifyStatus("error");
      setVerifyInlineError(msg);
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

  useEffect(() => {
    if (verifyStatus === "verified") {
      setShowRefresh(false);
    } else if (verifyStatus === "sent" || verifyStatus === "error") {
      setShowRefresh(true);
    }
  }, [verifyStatus]);

  useEffect(() => {
    if (!isLegalModalOpen) return;
    setHasScrolledLegal(false);
    const el = legalBodyRef.current;
    if (!el) return;
    const fitsWithoutScroll = el.scrollHeight - el.clientHeight <= 4;
    if (fitsWithoutScroll) {
      setHasScrolledLegal(true);
    }
  }, [isLegalModalOpen]);

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

    if (!hasAgreedLegal) {
      return showToast("error", "Please agree to the Terms & Privacy Policy to continue.");
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
    if (!hasAgreedLegal) {
      setVerifyInlineError("You must agree to the Terms & Privacy Policy before registering.");
      showToast("error", "Please agree to the Terms & Privacy Policy.");
      return;
    }
    const error = validate();
    if (error) return showToast("error", error);

    // Buyer flow: move verification after clicking Register
    if (role === "buyer") {
      if (verifyStatus === "verified") {
        handleFinalSubmit(e);
        return;
      }
      setShowVerifyModal(true);
      if (verifyStatus === "idle") {
        handleSendPreVerify();
      }
      return;
    }

    // Supplier flow: keep current gate before categories
    if (verifyStatus !== "verified") {
      setVerifyInlineError("Please verify this email before selecting categories or registering.");
      showToast("error", "Verify your email before continuing.");
      return;
    }

    setIsCategoryModalOpen(true);
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
    showRefresh,
    verifyInlineError,
    isLegalModalOpen,
    setIsLegalModalOpen,
    hasAgreedLegal,
    setHasAgreedLegal,
    hasScrolledLegal,
    setHasScrolledLegal,
    legalBodyRef,
    showVerifyModal,
    setShowVerifyModal,
    sendDisableUntil,
    checkDisableUntil,
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

const UserInputs = ({ formData, handleChange, role, verifyStatus, onSendVerify, onCheckVerify, preToken, showRefresh, verifyInlineError }) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <>
      <input type="text" name="fullName" placeholder={role === "supplier" ? "Contact Person Full Name" : "Full Name"} value={formData.fullName} onChange={handleChange} required />
      <input type="email" name="email" placeholder="Email Address" value={formData.email} onChange={handleChange} required />
      {role !== "buyer" && (
        <>
          <div className="verify-actions">
            <button
              type="button"
              className={`verify-btn ${verifyStatus === "verified" ? "verified" : ""}`}
              onClick={onSendVerify}
              disabled={verifyStatus === "sending" || verifyStatus === "verified"}
            >
              {verifyStatus === "sending" && "Sending..."}
              {verifyStatus === "verified" && (
                <>
                  <FaCheckCircle /> Email Verified
                </>
              )}
              {verifyStatus !== "sending" && verifyStatus !== "verified" && "Verify Email"}
            </button>
            {showRefresh && verifyStatus !== "verified" && (
              <button type="button" className="verify-btn secondary" onClick={onCheckVerify} disabled={!preToken || verifyStatus === "verified"}>
                <FaSyncAlt />
              </button>
            )}
          </div>
          {verifyStatus !== "idle" && (
            <p className="verify-guide">
              Check your Gmail inbox and spam for the verification link. Make sure you entered a valid Gmail address; the link expires in 24 hours.
            </p>
          )}
          {verifyInlineError && <p className="verify-error">{verifyInlineError}</p>}
        </>
      )}
      <div className="password-field">
        <input
          type={showPassword ? "text" : "password"}
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          required
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setShowPassword(v => !v)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <FaEyeSlash /> : <FaEye />}
        </button>
      </div>
      <input type="password" name="confirmPassword" placeholder="Confirm Password" value={formData.confirmPassword} onChange={handleChange} required />
    </>
  );
};

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
      <h3>Documents Checklist (optional guide)</h3>
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
    showRefresh,
    verifyInlineError,
    isLegalModalOpen,
    setIsLegalModalOpen,
    hasAgreedLegal,
    setHasAgreedLegal,
    hasScrolledLegal,
    setHasScrolledLegal,
    legalBodyRef,
    showVerifyModal,
    setShowVerifyModal,
    sendDisableUntil,
    checkDisableUntil,
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
            showRefresh={showRefresh}
            verifyInlineError={verifyInlineError}
          />
          {role === "supplier" && <SupplierInputs formData={formData} handleChange={handleChange} />}
        </div>

        {role === "supplier" && <DocumentChecks formData={formData} handleChange={handleChange} />}

        <div className="legal-consent">
          <button
            type="button"
            className="legal-link"
            onClick={() => {
              setHasScrolledLegal(false);
              setIsLegalModalOpen(true);
            }}
          >
            {hasAgreedLegal && <FaCheckCircle className="legal-check" aria-hidden />}
            <span>I agree to the Terms & Conditions and Privacy Policy</span>
          </button>
        </div>

        <div className="action-buttons">
          <button type="submit" disabled={isSubmitting} className="register-btn">
            {isSubmitting ? "Validating..." : (role === "supplier" ? "Next: Select Categories" : "Register")}
          </button>
          <button type="button" className="cancel-btn" onClick={() => navigate("/")}>Cancel Registration</button>
        </div>
      </form>

      {/* Buyer verify modal after clicking Register */}
      {showVerifyModal && role === "buyer" && (
        <div className="verify-modal-overlay" onClick={() => setShowVerifyModal(false)}>
          <div className="verify-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Verify your email to continue</h3>
            <p className="verify-guide">We sent a verification link to your email. Click it, then return here and confirm.</p>
            <div className="verify-actions-row">
              <button
                type="button"
                className="verify-btn"
                disabled={verifyStatus === "sending" || Date.now() < sendDisableUntil}
                onClick={handleSendPreVerify}
              >
                {verifyStatus === "sending" ? "Sending..." : "Resend email"}
              </button>
              <button
                type="button"
                className="verify-btn secondary"
                disabled={verifyStatus === "sending" || Date.now() < checkDisableUntil}
                onClick={handleCheckVerified}
              >
                I've verified
              </button>
            </div>
            {verifyStatus === "verified" && (
              <button
                type="button"
                className="register-btn"
                onClick={(e) => {
                  setShowVerifyModal(false);
                  handleFinalSubmit(e);
                }}
              >
                Continue to Register
              </button>
            )}
            <button type="button" className="cancel-btn" onClick={() => setShowVerifyModal(false)}>Close</button>
          </div>
        </div>
      )}

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

      {isLegalModalOpen && typeof document !== "undefined" && createPortal(
        <div className="legal-modal-overlay" onClick={() => setIsLegalModalOpen(false)}>
          <div className="legal-modal" onClick={e => e.stopPropagation()}>
            <header className="legal-modal-header">
              <h3>Terms & Conditions / Privacy Policy</h3>
              <button className="legal-close" onClick={() => setIsLegalModalOpen(false)} aria-label="Close">✖</button>
            </header>
            <div
              className="legal-modal-body"
              ref={legalBodyRef}
              onScroll={e => {
                const el = e.currentTarget;
                if (!el) return;
                const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 16;
                if (atBottom) setHasScrolledLegal(true);
              }}
            >
              <p><strong>Placeholder Terms</strong> — This is where your formal Terms & Conditions content will go. Include user responsibilities, acceptable use, account security, and liability limits.</p>
              <p><strong>Data Use</strong> — Explain what data is collected, why it is collected, and how it is used. Clarify retention, sharing, and user rights.</p>
              <p><strong>Privacy Commitments</strong> — Describe storage, encryption, and access controls. Note how users can request deletion or corrections.</p>
              <p><strong>Communications</strong> — Indicate when emails/notifications may be sent and how users can manage preferences.</p>
              <p><strong>Changes</strong> — State how updates to these terms will be communicated and when they take effect.</p>
              <p><strong>Contact</strong> — Provide a contact email/phone for questions about terms or privacy.</p>
              <p>Scroll to the bottom to enable the Agree button.</p>
            </div>
            <div className="legal-modal-actions">
              <button type="button" className="legal-disagree" onClick={() => { setHasAgreedLegal(false); setIsLegalModalOpen(false); }}>
                Disagree
              </button>
              <button
                type="button"
                className="legal-agree"
                disabled={!hasScrolledLegal}
                onClick={() => { setHasAgreedLegal(true); setIsLegalModalOpen(false); }}
              >
                I Agree
              </button>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
