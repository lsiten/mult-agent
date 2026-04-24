import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/useToast";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import type { OrganizationTreeResponse } from "@/lib/api";
import { deleteOrgNode, persistOrgNode, type DialogState } from "./orgActions";
import type { OrgDialogItem, OrgDialogParent, OrgNodeType, OrgNodeValues } from "./types";
import { formatReason, formatTemplate, getErrorMessage } from "./utils";

const EMPTY_TREE: OrganizationTreeResponse = { companies: [] };

export function useOrganizationPageController() {
  const { t } = useI18n();
  const { toast, showToast } = useToast();
  const [tree, setTree] = useState<OrganizationTreeResponse>(EMPTY_TREE);
  const [companyIndex, setCompanyIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const loadTree = useCallback(
    async (preferredCompanyId?: number) => {
      try {
        setLoading(true);
        const data = await api.getOrgTree();
        setTree(data);
        setCompanyIndex((current) => {
          if (preferredCompanyId) {
            const preferredIndex = data.companies.findIndex((company) => company.id === preferredCompanyId);
            return preferredIndex >= 0 ? preferredIndex : 0;
          }
          return data.companies[current] ? current : 0;
        });
      } catch {
        showToast(t.organization.loadFailed, "error");
      } finally {
        setLoading(false);
      }
    },
    [showToast, t.organization.loadFailed],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTree();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTree]);

  const selectedCompany = tree.companies[companyIndex] ?? tree.companies[0] ?? null;
  const multipleCompanies = tree.companies.length > 1;

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
    setCompanyIndex((current) => {
      const total = tree.companies.length;
      if (total <= 1) return current;
      return (current + direction + total) % total;
    });
  };

  const refreshSelectedCompany = () => {
    void loadTree(selectedCompany?.id);
  };

  const saveDialog = async (values: OrgNodeValues) => {
    if (!dialog) return;
    try {
      setSaving(true);
      const preferredCompanyId = await persistOrgNode(dialog, values, selectedCompany);
      closeDialog();
      showToast(t.organization.saved, "success");
      await loadTree(preferredCompanyId);
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
      await loadTree(type === "company" ? undefined : selectedCompany?.id);
    } catch (error) {
      showToast(formatReason(t.organization.deleteFailedWithReason, getErrorMessage(error)), "error");
    } finally {
      setSaving(false);
    }
  };

  return {
    deleteNode,
    dialog,
    loading,
    multipleCompanies,
    saving,
    selectedCompany,
    t,
    toast,
    tree,
    handleDialogOpenChange,
    moveCompany,
    openCreate,
    openCreateCompany,
    openEdit,
    refreshSelectedCompany,
    saveDialog,
  };
}
