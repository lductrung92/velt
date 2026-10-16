import { useEffect, useState } from "react";
import type { Member, Product } from "../types";
import { useSite } from "../context";
import { demoLink, safeUrl } from "../lib/links";
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
  const [member, setMember] = useState<Member | null>(null),
    [product, setProduct] = useState<Product | null>(null);
  const visible = limit ? members.slice(0, limit) : members;
  const [activeId, setActiveId] = useState(members[0]?.id);
  const openMember = (person: Member) => {
    setActiveId(person.id);
    setMember(person);
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
  };
  return (
    <>
      <section
        className="section team-section team-world-section"
        id="team"
        aria-labelledby="team-title"
      >
        <div className="container">
          <div className="team-world-layout">
            <header className="team-heading">
              <h2 id="team-title">{title}</h2>
              {subtitle && <p className="team-summary">{subtitle}</p>}
            </header>
            <TeamGlobe
              members={visible}
              activeId={activeId}
              onSelect={openMember}
              t={t}
            />
            <ul
              className="team-roster"
              id="team-list"
              aria-label={t("team.list_label")}
            >
              {visible.map((person) => (
                <li key={person.id}>
                  <button
                    className="team-member"
                    type="button"
                    data-member={person.id}
                    data-active={activeId === person.id}
                    data-color={person.color}
                    aria-label={t("team.view_profile_of", {
                      name: person.name,
                    })}
                    aria-haspopup="dialog"
                    onMouseEnter={() => setActiveId(person.id)}
                    onFocus={() => setActiveId(person.id)}
                    onClick={() => openMember(person)}
                  >
                    <span className="team-member-avatar" aria-hidden="true">
                      {safeUrl(person.image) ? (
                        <Img
                          src={safeUrl(person.image)}
                          width={person.imageWidth}
                          height={person.imageHeight}
                          alt=""
                          sizes="48px"
                        />
                      ) : (
                        person.name
                          .trim()
                          .split(/\s+/)
                          .slice(-2)
                          .map((part) => Array.from(part)[0])
                          .join("")
                          .toLocaleUpperCase()
                      )}
                    </span>
                    <span className="team-member-info">
                      <span className="team-member-name">{person.name}</span>
                      {person.role && (
                        <span className="team-member-role">{person.role}</span>
                      )}
                    </span>
                    <Icon name="arrow" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
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
                <div className="member-detail-head">
                  <Portrait member={member} detail />
                  <div>
                    <h2 id="detail-title" tabIndex={-1}>
                      {member.name}
                    </h2>
                    <p className="member-role">
                      {member.role || t("team.role_soon")}
                    </p>
                  </div>
                </div>
                <p className="member-detail-bio">
                  {member.bio || t("team.bio_soon")}
                </p>
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
