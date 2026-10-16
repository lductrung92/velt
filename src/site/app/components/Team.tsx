import { useEffect, useState } from "react";
import type { Member, Product } from "../types";
import { useSite } from "../context";
import { demoLink, safeUrl, withReferral } from "../lib/links";
import { teamConfig } from "../lib/sections";
import { Icon } from "./Icon";
import { Img } from "./Img";
import { Modal } from "./Modal";
import { TeamGlobe } from "./team/TeamGlobe";

export function Portrait({
  member,
  detail = false,
}: {
  member: Member;
  detail?: boolean;
}) {
  const { data } = useSite();
  const color = ["blue", "purple", "orange", "green", "pink"].includes(
    member.color,
  )
    ? member.color
    : "blue";
  const image = safeUrl(member.image);
  return (
    <div
      className={`member-portrait ${color} ${detail ? "detail-portrait" : "team-portrait"}`}
      aria-hidden="true"
    >
      {image ? (
        // The portrait fills the card; the dialog crops it to 110px.
        <Img
          src={image}
          width={member.imageWidth}
          height={member.imageHeight}
          alt=""
          sizes={
            detail ? "110px" : "(min-width: 768px) 360px, calc(100vw - 48px)"
          }
        />
      ) : (
        <>
          <span className="portrait-ring" />
          <span className="portrait-head" />
          <span className="portrait-body" />
          <span className="portrait-dot" />
          <span className="portrait-number">
            {String(data.members.indexOf(member) + 1).padStart(2, "0")}
          </span>
          {!detail && (
            <span className="portrait-emblem">
              <img src="/assets/favicon.png" alt="" />
            </span>
          )}
        </>
      )}
    </div>
  );
}
export function Skills({ skills }: { skills: string[] }) {
  return (
    <>
      {skills.map((skill) => (
        <span className="skill-chip" key={skill}>
          {skill}
        </span>
      ))}
    </>
  );
}
export function Team({
  config,
  members: sectionMembers,
}: {
  config?: unknown;
  members?: Member[];
}) {
  const { data, url, referrer, t } = useSite();
  const { title, subtitle, limit } = teamConfig(config, t);
  const members = sectionMembers ?? data.members;
  const [skill, setSkill] = useState(""),
    [member, setMember] = useState<Member | null>(null),
    [product, setProduct] = useState<Product | null>(null),
    [copyStatus, setCopyStatus] = useState("");
  const allSkills = [...new Set(members.flatMap((person) => person.skills))];
  const filtered = members.filter(
    (person) => !skill || person.skills.includes(skill),
  );
  const visible = limit ? filtered.slice(0, limit) : filtered;
  const missingPortrait = members.some((person) => !safeUrl(person.image));
  const [activeId, setActiveId] = useState(members[0]?.id);
  const openMember = (person: Member) => {
    setActiveId(person.id);
    setMember(person);
    setCopyStatus("");
  };
  useEffect(() => {
    setMember(
      members.find((person) => person.id === url.searchParams.get("member")) ||
        null,
    );
  }, [members, url]);
  const close = () => {
    setMember(null);
    setProduct(null);
    setCopyStatus("");
  };
  async function copyLink() {
    if (!member) return;
    const link = new URL(withReferral("/", member), location.origin).href;
    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus(t("team.copy_done"));
    } catch {
      setCopyStatus(t("team.copy_manual", { link }));
    }
  }
  return (
    <>
      <section
        className="section team-section team-world-section"
        id="team"
        aria-labelledby="team-title"
      >
        <div className="container">
          <header className="team-heading">
            <div>
              <span className="eyebrow">
                <i aria-hidden="true" />
                {t("team.eyebrow")}
              </span>
              <h2 id="team-title">{title}</h2>
            </div>
            <div className="team-intro">
              <p>{subtitle}</p>
              <div className="team-count">
                <span className="team-count-line" aria-hidden="true" />
                <span>
                  <strong id="team-member-count">{members.length}</strong>
                  {t("team.member_count")}
                </span>
              </div>
            </div>
          </header>
          <div className="team-world-layout">
            <TeamGlobe
              members={members}
              activeId={activeId}
              onSelect={openMember}
              t={t}
            />
            <div className="team-profiles">
              <header className="team-profile-heading">
                <h3>{t("team.profiles_title")}</h3>
                <p>{t("team.profiles_subtitle")}</p>
              </header>
              <div className="team-tools" hidden={!allSkills.length}>
                <div
                  className="skill-filter"
                  id="skill-filter"
                  aria-label={t("team.filter_label")}
                >
                  {["", ...allSkills].map((value) => (
                    <button
                      className="filter-button"
                      type="button"
                      key={value}
                      data-skill={value}
                      aria-pressed={value === skill}
                      onClick={() => setSkill(value)}
                    >
                      {value || t("team.filter_all")}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="team-grid"
                id="team-list"
                role="region"
                aria-label={t("team.list_label")}
              >
                {visible.map((person) => {
                  const count = data.products.filter((item) =>
                    item.memberIds?.includes(person.id),
                  ).length;
                  return (
                    <article
                      className="member-card"
                      key={person.id}
                      data-active={activeId === person.id}
                      onMouseEnter={() => setActiveId(person.id)}
                      onFocus={() => setActiveId(person.id)}
                    >
                      <span className="member-order" aria-hidden="true">
                        {safeUrl(person.image) ? (
                          <Img
                            src={safeUrl(person.image)}
                            width={person.imageWidth}
                            height={person.imageHeight}
                            alt=""
                            sizes="44px"
                          />
                        ) : (
                          <span>
                            {String(members.indexOf(person) + 1).padStart(
                              2,
                              "0",
                            )}
                          </span>
                        )}
                      </span>
                      <div className="member-card-info">
                        <div className="member-title-row">
                          <h3>{person.name}</h3>
                        </div>
                        <p className="member-role">
                          {person.role || t("team.role_pending")}
                        </p>
                        {person.bio && (
                          <p className="member-bio">{person.bio}</p>
                        )}
                        {!!person.skills.length && (
                          <div className="member-skills">
                            <Skills skills={person.skills.slice(0, 3)} />
                            {person.skills.length > 3 && (
                              <span className="skill-chip">
                                +{person.skills.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                        {!!count && (
                          <span className="member-project-count">
                            {count}
                            {t("team.product_count")}
                          </span>
                        )}
                      </div>
                      <button
                        className="profile-button"
                        type="button"
                        data-member={person.id}
                        aria-label={t("team.view_profile_of", {
                          name: person.name,
                        })}
                        onClick={() => openMember(person)}
                      >
                        <span>{t("team.view_profile")}</span>
                        <Icon name="arrow" />
                      </button>
                    </article>
                  );
                })}
                {!visible.length && (
                  <p className="empty-filter">{t("team.empty_filter")}</p>
                )}
              </div>
            </div>
          </div>
          <p
            className="team-footnote"
            hidden={
              !missingPortrait &&
              members.every((person) => person.bio && person.skills.length)
            }
          >
            <Icon name="user" />
            <span>
              {missingPortrait
                ? t("team.footnote_portraits")
                : t("team.footnote_profiles")}
            </span>
          </p>
        </div>
      </section>
      {(member || product) && (
        <Modal
          id="detail-dialog"
          titleId="detail-title"
          eyebrow={t(member ? "team.eyebrow" : "team.product_eyebrow")}
          onClose={close}
        >
          <div id="detail-body">
            {member ? (
              <>
                <Portrait member={member} detail />
                <h2 id="detail-title" tabIndex={-1}>
                  {member.name}
                </h2>
                <p className="member-role">
                  {member.role || t("team.role_soon")}
                </p>
                <p>{member.bio || t("team.bio_soon")}</p>
                <h3 className="detail-heading">{t("team.skills_title")}</h3>
                <div className="detail-skills">
                  {member.skills.length ? (
                    <Skills skills={member.skills} />
                  ) : (
                    <p className="detail-empty">{t("team.skills_empty")}</p>
                  )}
                </div>
                <h3 className="detail-heading">{t("team.products_title")}</h3>
                <div className="detail-products">
                  {data.products.some((item) =>
                    item.memberIds?.includes(member.id),
                  ) ? (
                    data.products
                      .filter((item) => item.memberIds?.includes(member.id))
                      .map((item) => (
                        <button
                          className="detail-link"
                          key={item.id}
                          onClick={() => {
                            setProduct(item);
                            setMember(null);
                          }}
                        >
                          {item.name} <Icon name="arrow" />
                        </button>
                      ))
                  ) : (
                    <p className="detail-empty">{t("team.products_empty")}</p>
                  )}
                </div>
                <div className="member-socials">
                  {member.links
                    .filter((link) => safeUrl(link.url))
                    .map((link) => (
                      <a
                        key={link.url}
                        href={safeUrl(link.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.label} ↗
                      </a>
                    ))}
                </div>
                <div className="member-share">
                  <button
                    type="button"
                    className="button button-soft"
                    data-share-member={member.id}
                    onClick={copyLink}
                  >
                    {t("team.copy_link")}
                    {member.name}
                  </button>
                  <p role="status" aria-live="polite">
                    {copyStatus}
                  </p>
                </div>
              </>
            ) : (
              product && (
                <>
                  {safeUrl(product.image) && (
                    <Img
                      className="project-detail-image"
                      src={safeUrl(product.image)}
                      width={product.imageWidth}
                      height={product.imageHeight}
                      alt={t("team.product_image_alt", { name: product.name })}
                      sizes="(min-width: 684px) 556px, calc(100vw - 72px)"
                    />
                  )}
                  {product.status && (
                    <span className="product-status">{product.status}</span>
                  )}
                  <h2 id="detail-title" tabIndex={-1}>
                    {product.name}
                  </h2>
                  <p>{product.description || product.summary}</p>
                  {!!product.skills?.length && (
                    <>
                      <h3 className="detail-heading">
                        {t("team.product_skills_title")}
                      </h3>
                      <div className="detail-skills">
                        <Skills skills={product.skills} />
                      </div>
                    </>
                  )}
                  <div className="project-members">
                    {data.members
                      .filter((person) =>
                        product.memberIds?.includes(person.id),
                      )
                      .map((person) => (
                        <button
                          className="detail-link"
                          key={person.id}
                          onClick={() => {
                            setMember(person);
                            setProduct(null);
                          }}
                        >
                          {person.name} <Icon name="arrow" />
                        </button>
                      ))}
                  </div>
                  {demoLink(product, referrer) && (
                    <a
                      className="button"
                      style={{ marginTop: 28 }}
                      href={demoLink(product, referrer)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {product.demoPlaceholder
                        ? t("team.demo_placeholder")
                        : t("team.demo_open")}{" "}
                      <Icon name="arrow" />
                    </a>
                  )}
                </>
              )
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
