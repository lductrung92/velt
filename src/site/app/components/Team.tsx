import { useEffect, useState } from "react";
import type { Member, Product } from "../types";
import { useSite } from "../context";
import { demoLink, safeUrl, withReferral } from "../lib/links";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

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
        <img src={image} alt="" loading="lazy" />
      ) : (
        <>
          <span className="portrait-ring" />
          <span className="portrait-head" />
          <span className="portrait-body" />
          <span className="portrait-dot" />
          <span className="portrait-number">
            {String(data.members.indexOf(member) + 1).padStart(2, "0")}
          </span>
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
export function Team() {
  const { data, url, referrer } = useSite();
  const [skill, setSkill] = useState(""),
    [member, setMember] = useState<Member | null>(null),
    [product, setProduct] = useState<Product | null>(null),
    [copyStatus, setCopyStatus] = useState("");
  const allSkills = [
    ...new Set(data.members.flatMap((person) => person.skills)),
  ];
  const visible = data.members.filter(
    (person) => !skill || person.skills.includes(skill),
  );
  const missingPortrait = data.members.some((person) => !safeUrl(person.image));
  useEffect(() => {
    setMember(
      data.members.find(
        (person) => person.id === url.searchParams.get("member"),
      ) || null,
    );
  }, [data.members, url]);
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
      setCopyStatus("Đã sao chép link hồ sơ. Bạn có thể gửi cho khách.");
    } catch {
      setCopyStatus(`Sao chép link: ${link}`);
    }
  }
  return (
    <>
      <section
        className="section team-section"
        id="team"
        aria-labelledby="team-title"
      >
        <div className="container">
          <header className="team-heading">
            <div>
              <span className="eyebrow">
                <i aria-hidden="true" />
                ĐỘI NGŨ ZUKATEK
              </span>
              <h2 id="team-title">Đội ngũ phát triển</h2>
            </div>
            <div className="team-intro">
              <p>
                Mỗi sản phẩm gắn với những người trực tiếp phát triển. Tìm hiểu
                chuyên môn và sản phẩm từng thành viên tham gia.
              </p>
              <div className="team-count">
                <span className="team-count-line" aria-hidden="true" />
                <span>
                  <strong id="team-member-count">{data.members.length}</strong>{" "}
                  thành viên · Cùng phát triển sản phẩm ZUKATEK
                </span>
              </div>
            </div>
          </header>
          <div className="team-tools" hidden={!allSkills.length}>
            <div
              className="skill-filter"
              id="skill-filter"
              aria-label="Lọc thành viên theo kỹ năng"
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
                  {value || "Tất cả thành viên"}
                </button>
              ))}
            </div>
          </div>
          <div
            className="team-grid"
            id="team-list"
            role="region"
            aria-label="Danh sách thành viên ZUKATEK"
          >
            {visible.map((person) => {
              const count = data.products.filter((item) =>
                item.memberIds?.includes(person.id),
              ).length;
              return (
                <article className="member-card" key={person.id}>
                  <div className="member-media">
                    <Portrait member={person} />
                    <span className="member-index">
                      {String(data.members.indexOf(person) + 1).padStart(
                        2,
                        "0",
                      )}
                    </span>
                    {!safeUrl(person.image) && (
                      <span className="portrait-placeholder-label">
                        Ảnh minh họa
                      </span>
                    )}
                  </div>
                  <div className="member-card-info">
                    <div className="member-title-row">
                      <h3>{person.name}</h3>
                      <button
                        className="profile-button"
                        type="button"
                        data-member={person.id}
                        aria-label={`Xem hồ sơ ${person.name}`}
                        title="Xem hồ sơ"
                        onClick={() => {
                          setMember(person);
                          setCopyStatus("");
                        }}
                      >
                        <Icon name="arrow" />
                      </button>
                    </div>
                    <p className="member-role">
                      {person.role || "Thành viên ZUKATEK"}
                    </p>
                    {person.bio && <p className="member-bio">{person.bio}</p>}
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
                        {count} sản phẩm tham gia
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
            {!visible.length && (
              <p className="empty-filter">Chưa có thành viên phù hợp.</p>
            )}
          </div>
          <p
            className="team-footnote"
            hidden={
              !missingPortrait &&
              data.members.every((person) => person.bio && person.skills.length)
            }
          >
            <Icon name="user" />
            <span>
              {missingPortrait
                ? "Chân dung đang dùng hình minh họa. Tên, ảnh và chuyên môn sẽ được cập nhật trong hồ sơ thành viên."
                : "Thông tin giới thiệu và chuyên môn sẽ được bổ sung trong hồ sơ thành viên."}
            </span>
          </p>
        </div>
      </section>
      {(member || product) && (
        <Modal
          id="detail-dialog"
          titleId="detail-title"
          eyebrow={member ? "ĐỘI NGŨ ZUKATEK" : "SẢN PHẨM ZUKATEK"}
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
                  {member.role || "Hồ sơ sắp cập nhật"}
                </p>
                <p>
                  {member.bio ||
                    "Thông tin giới thiệu của thành viên sẽ sớm được bổ sung. Cùng quay lại để khám phá vai trò, góc nhìn và thế mạnh của mỗi người trong ZUKATEK."}
                </p>
                <h3 className="detail-heading">Kỹ năng & thế mạnh</h3>
                <div className="detail-skills">
                  {member.skills.length ? (
                    <Skills skills={member.skills} />
                  ) : (
                    <p className="detail-empty">
                      Thông tin kỹ năng đang được cập nhật.
                    </p>
                  )}
                </div>
                <h3 className="detail-heading">Sản phẩm tham gia</h3>
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
                    <p className="detail-empty">
                      Chưa có sản phẩm được công bố.
                    </p>
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
                    Sao chép link giới thiệu của {member.name}
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
                    <img
                      className="project-detail-image"
                      src={safeUrl(product.image)}
                      alt={`Giao diện ${product.name}`}
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
                      <h3 className="detail-heading">Kỹ năng trong sản phẩm</h3>
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
                        ? "Mở link tạm"
                        : "Trải nghiệm sản phẩm"}{" "}
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
