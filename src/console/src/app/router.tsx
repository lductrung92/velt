import { createBrowserRouter, Navigate } from "react-router-dom";

import { UnsavedChangesProvider } from "@/app/UnsavedChangesProvider";

import { AppLayoutCombo } from "@/components/common/AppLayoutCombo";
import {
  AccountLayout,
  ChangePassword,
  Profile,
  TwoFactor,
} from "@/modules/account";
import {
  ActivityLog,
  AdminHome,
  RolePermissions,
  Sessions,
  SystemSettings,
  UserManagement,
} from "@/modules/admin";
import { ChatInbox } from "@/modules/chat";
import { LeadList } from "@/modules/crm";
import {
  ForgotPassword,
  Login,
  ProtectedRoute,
  PublicOnlyRoute,
  RequirePermission,
  ResetPassword,
} from "@/modules/auth";
import {
  ArticleEditor,
  ArticleList,
  CategoryEditor,
  CategoryTree,
  CmsTags,
  MenuBuilder,
  PageEditor,
  PageList,
} from "@/modules/cms";
import { MemberEditor, MemberList } from "@/modules/members";
import Dashboard from "@/modules/dashboard/Dashboard";
import {
  ProductCategoryEditor,
  ProductCategoryList,
  ProductEditor,
  ProductList,
} from "@/modules/products";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <PublicOnlyRoute>
        <Login />
      </PublicOnlyRoute>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <PublicOnlyRoute>
        <ForgotPassword />
      </PublicOnlyRoute>
    ),
  },
  {
    path: "/reset-password",
    element: (
      <PublicOnlyRoute>
        <ResetPassword />
      </PublicOnlyRoute>
    ),
  },
  // Root forwards to the dashboard. Kept
  // outside the protected shell on purpose — see the note on ProtectedRoute
  // below; a redirect rendered inside it ping-pongs with PublicOnlyRoute while
  // auth is still bootstrapping.
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  // Authenticated app shell — all protected routes render inside AppLayout.
  {
    element: (
      <ProtectedRoute>
        {/* Inside the router on purpose: useBlocker needs the route context,
            and RouterProvider takes no children. One provider here covers
            every protected screen. */}
        <UnsavedChangesProvider>
          <AppLayoutCombo />
        </UnsavedChangesProvider>
      </ProtectedRoute>
    ),
    children: [
      { path: "/dashboard", element: <Dashboard /> },
      {
        path: "/account",
        element: <AccountLayout />,
        children: [
          { index: true, element: <Navigate to="/account/profile" replace /> },
          { path: "profile", element: <Profile /> },
          { path: "password", element: <ChangePassword /> },
          { path: "2fa", element: <TwoFactor /> },
        ],
      },
      {
        path: "/admin",
        element: (
          <RequirePermission
            permission={[
              "users.read",
              "roles.read",
              "permissions.read",
              "sessions.read",
            ]}
            mode="any"
          >
            <AdminHome />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/users",
        element: (
          <RequirePermission permission="users.read">
            <UserManagement />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/sessions",
        element: (
          <RequirePermission permission="sessions.read">
            <Sessions />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/activity",
        element: (
          <RequirePermission permission="activity.read">
            <ActivityLog />
          </RequirePermission>
        ),
      },
      {
        path: "/chat",
        element: (
          <RequirePermission permission="ai.chat.handle">
            <ChatInbox />
          </RequirePermission>
        ),
      },
      {
        path: "/leads",
        element: (
          <RequirePermission permission="crm.leads.view_all">
            <LeadList />
          </RequirePermission>
        ),
      },
      {
        // Every setting in one place. The permission is checked inside too, so
        // an editor who may only touch the site's own settings still gets the
        // screen — with the groups they can write.
        path: "/admin/settings",
        element: (
          <RequirePermission
            permission={["settings.manage", "cms.settings.manage"]}
            mode="any"
          >
            <SystemSettings />
          </RequirePermission>
        ),
      },
      {
        path: "/admin/roles",
        element: (
          <RequirePermission permission="roles.read">
            <RolePermissions />
          </RequirePermission>
        ),
      },
      {
        path: "/cms/articles",
        element: (
          <RequirePermission permission="cms.article.view">
            <ArticleList />
          </RequirePermission>
        ),
      },
      {
        path: "/cms/articles/new",
        element: (
          <RequirePermission permission="cms.article.create">
            <ArticleEditor />
          </RequirePermission>
        ),
      },
      {
        path: "/cms/articles/:id",
        element: (
          <RequirePermission permission="cms.article.view">
            <ArticleEditor />
          </RequirePermission>
        ),
      },
      {
        path: "/cms/pages",
        element: (
          <RequirePermission permission="cms.page.view">
            <PageList />
          </RequirePermission>
        ),
      },
      {
        path: "/cms/pages/new",
        element: (
          <RequirePermission permission="cms.page.create">
            <PageEditor />
          </RequirePermission>
        ),
      },
      {
        path: "/cms/pages/:id",
        element: (
          <RequirePermission permission="cms.page.view">
            <PageEditor />
          </RequirePermission>
        ),
      },
      {
        path: "/cms/categories",
        element: (
          <RequirePermission permission="cms.article.view">
            <CategoryTree />
          </RequirePermission>
        ),
      },
      {
        path: "/cms/categories/new",
        element: (
          <RequirePermission permission="cms.taxonomy.manage">
            <CategoryEditor />
          </RequirePermission>
        ),
      },
      {
        path: "/cms/categories/:id",
        element: (
          <RequirePermission permission="cms.taxonomy.manage">
            <CategoryEditor />
          </RequirePermission>
        ),
      },
      {
        path: "/cms/tags",
        element: (
          <RequirePermission permission="cms.article.view">
            <CmsTags />
          </RequirePermission>
        ),
      },
      {
        path: "/products",
        element: (
          <RequirePermission permission="products.view">
            <ProductList />
          </RequirePermission>
        ),
      },
      {
        path: "/products/new",
        element: (
          <RequirePermission permission="products.create">
            <ProductEditor />
          </RequirePermission>
        ),
      },
      {
        path: "/products/:id",
        element: (
          <RequirePermission permission="products.view">
            <ProductEditor />
          </RequirePermission>
        ),
      },
      {
        path: "/product-categories",
        element: (
          <RequirePermission permission="products.view">
            <ProductCategoryList />
          </RequirePermission>
        ),
      },
      {
        path: "/product-categories/new",
        element: (
          <RequirePermission permission="products.category.manage">
            <ProductCategoryEditor />
          </RequirePermission>
        ),
      },
      {
        path: "/product-categories/:id",
        element: (
          <RequirePermission permission="products.view">
            <ProductCategoryEditor />
          </RequirePermission>
        ),
      },
      {
        path: "/members",
        element: (
          <RequirePermission permission="members.view">
            <MemberList />
          </RequirePermission>
        ),
      },
      {
        path: "/members/new",
        element: (
          <RequirePermission permission="members.manage">
            <MemberEditor />
          </RequirePermission>
        ),
      },
      {
        path: "/members/:id",
        element: (
          <RequirePermission permission="members.view">
            <MemberEditor />
          </RequirePermission>
        ),
      },
      {
        path: "/cms/menus",
        element: (
          <RequirePermission permission="cms.menu.manage">
            <MenuBuilder />
          </RequirePermission>
        ),
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
