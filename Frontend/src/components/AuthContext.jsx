import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [userRole, setUserRole] = useState("");
  const [token, setToken] = useState("");
  const [fullName, setFullName] = useState("");
  const [userID, setUserID] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const readStorage = (key) => {
    try {
      const local = localStorage.getItem(key);
      if (local !== null && local !== undefined) return local;
    } catch {}
    try {
      const session = sessionStorage.getItem(key);
      if (session !== null && session !== undefined) return session;
    } catch {}
    return null;
  };

  // Load from session storage on mount and sync across tabs
  useEffect(() => {
    const storedToken = readStorage("token");
    const storedRole = readStorage("userRole");
    const storedFullName = readStorage("fullName");
    const storedUserID = readStorage("userID");
    const storedEmailVerified = readStorage("emailVerified");

    if (storedToken && storedRole) {
      setToken(storedToken);
      setUserRole(storedRole);
      setFullName(storedFullName || "");
      setUserID(storedUserID || "");
      if (storedEmailVerified !== null) {
        setEmailVerified(storedEmailVerified === "true");
      }
    }
    setIsLoading(false);

    const handleStorageChange = () => {
      const newToken = readStorage("token") || "";
      const newRole = readStorage("userRole") || "";
      const newFullName = readStorage("fullName") || "";
      const newUserID = readStorage("userID") || "";
      const newEmailVerified = readStorage("emailVerified");

      setToken(newToken);
      setUserRole(newRole);
      setFullName(newFullName);
      setUserID(newUserID);
      setEmailVerified(newEmailVerified === "true");
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const updateEmailVerified = (value) => {
    const normalized = !!value;
    setEmailVerified(normalized);
    try {
      localStorage.setItem("emailVerified", String(normalized));
      sessionStorage.setItem("emailVerified", String(normalized));
    } catch {}
  };

  // Login: Update state and storage
  const login = (data) => {
    const { token: newToken, user } = data;
    setToken(newToken);
    setUserRole(user.role.toLowerCase());
    setFullName(user.fullName);
    setUserID(user.userID);
    updateEmailVerified(user.email_verified);
    try {
      localStorage.setItem("token", newToken);
      localStorage.setItem("userRole", user.role.toLowerCase());
      localStorage.setItem("fullName", user.fullName);
      localStorage.setItem("userID", user.userID);
      localStorage.setItem("emailVerified", String(!!user.email_verified));

      // Keep sessionStorage in sync for backward compatibility
      sessionStorage.setItem("token", newToken);
      sessionStorage.setItem("userRole", user.role.toLowerCase());
      sessionStorage.setItem("fullName", user.fullName);
      sessionStorage.setItem("userID", user.userID);
      sessionStorage.setItem("emailVerified", String(!!user.email_verified));
    } catch {}
  };

  // Logout: Clear state and storage
  const logout = () => {
    setToken("");
    setUserRole("");
    setFullName("");
    setUserID("");
    updateEmailVerified(false);
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("userRole");
      localStorage.removeItem("fullName");
      localStorage.removeItem("userID");
      localStorage.removeItem("emailVerified");
      sessionStorage.clear();
    } catch {}
  };

  return (
    <AuthContext.Provider
      value={{
        userRole,
        token,
        fullName,
        userID,
        emailVerified,
        isLoading,
        login,
        logout,
        setEmailVerified: updateEmailVerified,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};