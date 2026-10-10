// Public entry point for the auth module (architecture.md: cross-module code
// imports only via this file).
export { default as Login } from "./pages/Login";
export { default as ForgotPassword } from "./pages/ForgotPassword";
export { default as ResetPassword } from "./pages/ResetPassword";
export { ProtectedRoute } from "./components/ProtectedRoute";
export { PublicOnlyRoute } from "./components/PublicOnlyRoute";
export { AuthBootstrap } from "./components/AuthBootstrap";
export { RequirePermission } from "./components/RequirePermission";
export { RequireRoles } from "./components/RequireRoles";
export {
  useLogin,
  useVerifyTwoFactor,
  useLogout,
  useLogoutAll,
} from "./hooks/useAuth";
export { usePermission } from "./hooks/usePermission";
