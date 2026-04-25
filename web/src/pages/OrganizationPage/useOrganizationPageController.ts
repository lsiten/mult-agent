import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/useToast";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import type { OrganizationTreeResponse, OrgCompany } from "@/lib/api";
import { deleteOrgNode, persistOrgNode, type DialogState } from "./orgActions";
import type { OrgDialogItem, OrgDialogParent, OrgNodeType, OrgNodeValues } from "./types";
import { formatReason, formatTemplate, getErrorMessage } from "./utils";

const EMPTY_TREE: OrganizationTreeResponse = { companies: [] };

export function useOrganizationPageController() {
  const { t } = useI18n();
  const { toast, showToast } = useToast();
  const [companies, setCompanies] = useState<OrgCompany[]>([]);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<OrgCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const loadCompaniesList = useCallback(
    async () => {
      try {
        setLoading(true);
        // Get list of all companies only (for the dropdown selector)
        const data = await api.getOrgTree();
        setCompanies(data.companies);
        // Auto-select the first company or the last created
        if (data.companies.length > 0) {
          const lastCompany = data.companies[data.companies.length - 1];
          setCompanyId(lastCompany.id);
        }
      } catch {
        showToast(t.organization.loadFailed, "error");
      } finally {
        setLoading(false);
      }
    },
    [showToast, t.organization.loadFailed],
  );

  const loadSelectedCompany = useCallback(
    async (id: number) => {
      try {
        setLoadingCompany(true);
        // Load ONLY the selected company's full tree (data isolation)
        // Only returns data belonging to this company, no other companies exposed
        const data = await api.getOrgCompanyTree(id);
        setSelectedCompany(data.company);
      } catch {
        showToast(t.organization.loadFailed, "error");
        setSelectedCompany(null);
      } finally {
        setLoadingCompany(false);
      }
    },
    [showToast, t.organization.loadFailed],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCompaniesList();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCompaniesList]);

  useEffect(() => {
    if (companyId !== null) {
      void loadSelectedCompany(companyId);
    } else {
      setSelectedCompany(null);
    }
  }, [companyId, loadSelectedCompany]);

  const multipleCompanies = companies.length > 1;

  const companyContext = useMemo(() => {
    return selectedCompany ? { company: selectedCompany } : {};
  }, [selectedCompany]);

  const openCreate = (type: OrgNodeType, parent: OrgDialogParent = companyContext) => {
    setDialog({ type, item: null, parent });
  };

  const openCreateCompany = () => {
    openCreate("company", {});
  };

  const openEdit = (type: OrgNodeType, item: OrgDialogItem, parent: OrgDialogParent) => {
    setDialog({ type, item, parent });
  };

  const closeDialog = () => setDialog(null);

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) closeDialog();
  };

  const moveCompany = (direction: -1 | 1) => {
    setCompanyId((currentId) => {
      const currentIndex = companies.findIndex(c => c.id === currentId);
      const total = companies.length;
      if (total <= 1) return currentId;
      const newIndex = (currentIndex + direction + total) % total;
      return companies[newIndex].id;
    });
  };

  const refreshSelectedCompany = () => {
    if (companyId) {
      void loadSelectedCompany(companyId);
    } else {
      void loadCompaniesList();
    }
  };

  const saveDialog = async (values: OrgNodeValues) => {
    if (!dialog) return;
    try {
      setSaving(true);
      const preferredCompanyId = await persistOrgNode(dialog, values, selectedCompany);
      closeDialog();
      showToast(t.organization.saved, "success");
      // After saving, reload company list and refresh selected company
      await loadCompaniesList();
      if (preferredCompanyId) {
        setCompanyId(preferredCompanyId);
      }
    } catch (error) {
      showToast(formatReason(t.organization.saveFailedWithReason, getErrorMessage(error)), "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteNode = async (type: OrgNodeType, item: OrgDialogItem) => {
    const typeLabel = {
      company: t.organization.company,
      department: t.organization.department,
      position: t.organization.position,
      agent: t.organization.agent,
    }[type];
    const nodeName =
      ("display_name" in item && item.display_name) || ("name" in item && item.name) || String(item.id);

    const confirmed = window.confirm(
      formatTemplate(t.organization.deleteConfirmWithName, {
        type: typeLabel,
        name: nodeName,
      }),
    );
    if (!confirmed) return;

    try {
      setSaving(true);
      await deleteOrgNode(type, item.id);
      showToast(t.organization.deleted, "success");
      // After deleting, reload company list
      await loadCompaniesList();
      if (type === "company" && selectedCompany) {
        // If we deleted the selected company, the list will update and companyId will auto-select
      }
    } catch (error) {
      showToast(formatReason(t.organization.deleteFailedWithReason, getErrorMessage(error)), "error");
    } finally {
      setSaving(false);
    }
  };

  return {
    companies,
    companyId,
    deleteNode,
    dialog,
    loading,
    loadingCompany,
    multipleCompanies,
    saving,
    selectedCompany,
    t,
    toast,
    handleDialogOpenChange,
    moveCompany,
    openCreate,
    openCreateCompany,
    openEdit,
    refreshSelectedCompany,
    saveDialog,
  };
}
