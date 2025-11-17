import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * @param {Object} props
 * @param {string} props.requiredRole - The role required to access the route (e.g., "admin")
 * @param {React.Component} props.children - The component to render if authorized
 */
const ProtectedRoute = ({ requiredRole, children }) => {
  const { userRole, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>; // Or a spinner component
  if (!userRole) return <Navigate to="/" replace />;
  if (userRole !== requiredRole) return <Navigate to="/" replace />;

  return children;
};

export default ProtectedRoute;