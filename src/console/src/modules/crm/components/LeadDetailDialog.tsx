import {
  ArrowRight,
  FileText,
  Mail,
  MessageSquare,
  Package,
  Phone,
  User,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ModalHeader } from "@/components/common/ModalHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { formatDateTime } from "@/utils/format";

import type { Lead } from "../services/leads.service";

/** One labelled fact. Absent values are dropped by the caller rather than
 *  rendered as an empty row: a blank line beside a label reads as a bug. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="lead-detail-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Everything the console knows about one lead.
 *
 * It exists mainly for the message: the list has no column for `note`, so what
 * a customer actually wrote — the whole content of a contact-form submission —
 * was not visible anywhere in the console before this.
 */
export function LeadDetailDialog({
  lead,
  onClose,
  status,
  source,
  canChat,
}: {
  lead: Lead | null;
  onClose: () => void;
  /** Rendered by the list, which already owns the stage control and the source
   *  badge. Passing the nodes keeps one definition of each rather than a
   *  second one that drifts. */
  status: ReactNode;
  source: ReactNode;
  canChat: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (!lead) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl" closeLabel={t("common.close")}>
        <ModalHeader
          icon={User}
          title={t("leads.detail.title")}
          subject={t("leads.detail.subtitle")}
        />
        <div className="lead-detail-body">
          <div className="lead-detail-customer">
            <span className="lead-detail-avatar" aria-hidden="true">
              {lead.name?.trim() ? (
                lead.name
                  .trim()
                  .split(/\s+/)
                  .slice(-2)
                  .map((part) => Array.from(part)[0])
                  .join("")
                  .toLocaleUpperCase()
              ) : (
                <User />
              )}
            </span>
            <div className="lead-detail-identity">
              <h3>{lead.name?.trim() || t("leads.detail.no_name")}</h3>
              <span>{t("leads.detail.customer_profile")}</span>
            </div>
          </div>

          <div className="lead-detail-groups">
            <div className="lead-detail-message-column">
              <section className="lead-detail-note">
                <h3>
                  <FileText aria-hidden />
                  {t("leads.detail.message")}
                </h3>
                {lead.note?.trim() ? (
                  <p>{lead.note}</p>
                ) : (
                  <p className="lead-detail-empty">
                    {t("leads.detail.no_message")}
                  </p>
                )}
              </section>
              {!!lead.products.length && (
                <section className="lead-detail-products">
                  <h3>
                    <Package aria-hidden />
                    {t("leads.col.products")}
                  </h3>
                  <ul>
                    {lead.products.map((product) => (
                      <li key={product.id}>{product.name}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            <div className="lead-detail-info-column">
              <section className="lead-detail-group">
                <h3>
                  <Mail aria-hidden />
                  {t("leads.detail.contact")}
                </h3>
                <dl className="lead-detail">
                  {lead.email && (
                    <Fact label={t("leads.detail.email")}>
                      <a href={`mailto:${lead.email}`}>{lead.email}</a>
                    </Fact>
                  )}
                  {lead.phone && (
                    <Fact label={t("leads.detail.phone")}>
                      <a href={`tel:${lead.phone}`}>{lead.phone}</a>
                    </Fact>
                  )}
                  {lead.zalo && (
                    <Fact label="Zalo">
                      <a
                        href={lead.zalo}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {lead.zalo}
                      </a>
                    </Fact>
                  )}
                </dl>
              </section>
              <section className="lead-detail-group">
                <h3>
                  <Users aria-hidden />
                  {t("leads.detail.follow_up")}
                </h3>
                <dl className="lead-detail">
                  <Fact label={t("leads.col.status")}>{status}</Fact>
                  <Fact label={t("leads.col.source")}>{source}</Fact>
                  <Fact label={t("leads.col.assignee")}>
                    {lead.assignee?.full_name || t("leads.unassigned")}
                  </Fact>
                  <Fact label={t("leads.col.created")}>
                    {formatDateTime(lead.created_at)}
                  </Fact>
                  <Fact label={t("leads.detail.updated")}>
                    {formatDateTime(lead.updated_at)}
                  </Fact>
                </dl>
              </section>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          {lead.email && (
            <Button asChild variant="default">
              <a href={`mailto:${lead.email}`}>
                <Mail className="size-4" />
                {t("leads.detail.reply")}
              </a>
            </Button>
          )}
          {lead.phone && (
            <Button asChild variant="outline">
              <a href={`tel:${lead.phone}`}>
                <Phone className="size-4" />
                {t("leads.detail.call")}
              </a>
            </Button>
          )}
          {lead.conversation_id && canChat && (
            <Button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/chat?conversation=${lead.conversation_id}`);
              }}
            >
              <MessageSquare className="size-4" />
              {t("leads.open_chat")}
              <ArrowRight className="size-3" aria-hidden />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
