// Presentation migrated from the approved mockup. All interaction is owned by React.
type LinksProps = { href: (path: string) => string };

export function Icons() {
  return (
    <svg
      className="svg-definitions"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <symbol id="i-arrow" viewBox="0 0 24 24">
          <path d="M5 12h14m-6-6 6 6-6 6"></path>
        </symbol>
        <symbol id="i-chevron" viewBox="0 0 24 24">
          <path d="m8 4 8 8-8 8"></path>
        </symbol>
        <symbol id="i-down" viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6"></path>
        </symbol>
        <symbol id="i-spark" viewBox="0 0 24 24">
          <path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z"></path>
        </symbol>
        <symbol id="i-user" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4"></circle>
          <path d="M4 21v-2a8 8 0 0 1 16 0v2"></path>
        </symbol>
        <symbol id="i-users" viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3"></circle>
          <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"></path>
        </symbol>
        <symbol id="i-grid" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="2"></rect>
          <rect x="14" y="3" width="7" height="7" rx="2"></rect>
          <rect x="3" y="14" width="7" height="7" rx="2"></rect>
          <rect x="14" y="14" width="7" height="7" rx="2"></rect>
        </symbol>
        <symbol id="i-bulb" viewBox="0 0 24 24">
          <path d="M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"></path>
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <path d="m5 12 4 4L19 6"></path>
        </symbol>
        <symbol id="i-close" viewBox="0 0 24 24">
          <path d="m6 6 12 12M6 18 18 6"></path>
        </symbol>
        <symbol id="i-mail" viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="14" rx="3"></rect>
          <path d="m3 7 9 6 9-6"></path>
        </symbol>
        <symbol id="i-support" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="3"></circle>
          <path d="M6 22v-2a6 6 0 0 1 12 0v2M5 10V8a7 7 0 0 1 14 0v2"></path>
          <rect x="3" y="9" width="3" height="6" rx="1.5"></rect>
          <rect x="18" y="9" width="3" height="6" rx="1.5"></rect>
          <path d="M19 15v1a2 2 0 0 1-2 2h-3"></path>
        </symbol>
        <symbol id="i-building" viewBox="0 0 24 24">
          <rect x="5" y="3" width="14" height="18" rx="2"></rect>
          <path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1m-4 6v-3h2v3"></path>
        </symbol>
        <symbol id="i-copy" viewBox="0 0 24 24">
          <rect x="8" y="8" width="12" height="13" rx="2"></rect>
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"></path>
        </symbol>
      </defs>
    </svg>
  );
}

export function Hero({ href }: LinksProps) {
  return (
    <div className="hero-wrap" id="top">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="hero-eyebrow">{"HỆ SINH THÁI SẢN PHẨM ZUKATEK"}</span>
            <h1 id="hero-title">
              {"Sản phẩm số"}
              <br />
              {"cho công việc của bạn."}
            </h1>
            <p className="hero-subtitle">
              {
                "ZUKATEK phát triển và cung cấp sản phẩm số cho cá nhân, nhóm và doanh nghiệp. Xem tính năng, trải nghiệm sản phẩm và nhận tư vấn để chọn giải pháp phù hợp."
              }
            </p>
            <div className="hero-actions">
              <a className="button button-large" href={href("/#products")}>
                {"Xem sản phẩm "}
                <svg className="icon">
                  <use href="#i-arrow"></use>
                </svg>
              </a>
            </div>
            <a className="hero-note" href={href("/#team")}>
              <svg className="icon">
                <use href="#i-bulb"></use>
              </svg>
              <span>{"Tìm hiểu đội ngũ phát triển sản phẩm"}</span>
              <svg className="icon note-arrow">
                <use href="#i-chevron"></use>
              </svg>
            </a>
          </div>
          <div
            className="hero-visual"
            role="img"
            aria-label="Minh họa hệ sinh thái sản phẩm ZUKATEK dành cho cá nhân, nhóm và doanh nghiệp"
          >
            <div className="visual-backdrop">
              <div className="backdrop-ring"></div>
              <div className="visual-wordmark">
                {"ZUKATEK"}
                <span>{"Digital products."}</span>
              </div>
              <div className="orb orb-one"></div>
              <div className="orb orb-two"></div>
            </div>
            <div className="studio-window">
              <div className="window-top">
                <div className="window-dots">
                  <i></i>
                  <i></i>
                  <i></i>
                </div>
                <span>{"Hệ sinh thái ZUKATEK"}</span>
                <svg className="icon">
                  <use href="#i-grid"></use>
                </svg>
              </div>
              <div className="window-content">
                <div className="window-sidebar">
                  <img
                    src="/assets/favicon.png"
                    alt=""
                    width="28"
                    height="28"
                  />
                  <span className="side-square active"></span>
                  <span className="side-square"></span>
                  <span className="side-square"></span>
                  <span className="side-square"></span>
                </div>
                <div className="window-main">
                  <span className="mini-label">
                    {"SẢN PHẨM SỐ CHO CÔNG VIỆC"}
                  </span>
                  <strong>{"Giải pháp cho từng nhu cầu."}</strong>
                  <div className="mini-cards">
                    <div className="mini-card">
                      <span className="mini-icon blue">
                        <svg className="icon">
                          <use href="#i-bulb"></use>
                        </svg>
                      </span>
                      <b>{"Cá nhân"}</b>
                      <span className="mini-line"></span>
                      <span className="mini-line short"></span>
                    </div>
                    <div className="mini-card">
                      <span className="mini-icon purple">
                        <svg className="icon">
                          <use href="#i-users"></use>
                        </svg>
                      </span>
                      <b>{"Nhóm"}</b>
                      <span className="mini-line"></span>
                      <span className="mini-line short"></span>
                    </div>
                    <div className="mini-card">
                      <span className="mini-icon orange">
                        <svg className="icon">
                          <use href="#i-grid"></use>
                        </svg>
                      </span>
                      <b>{"Doanh nghiệp"}</b>
                      <span className="mini-line"></span>
                      <span className="mini-line short"></span>
                    </div>
                  </div>
                  <div className="mini-team">
                    <span>{"Đội ngũ phát triển sản phẩm"}</span>
                    <div className="avatar-stack">
                      <i>{"01"}</i>
                      <i>{"02"}</i>
                      <i>{"03"}</i>
                      <i>{"04"}</i>
                      <i>{"05"}</i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="floating-note">
              <span className="floating-icon">
                <svg className="icon">
                  <use href="#i-spark"></use>
                </svg>
              </span>
              <span>
                <strong>{"Khám phá sản phẩm ZUKATEK"}</strong>
                <small>{"Cá nhân · Nhóm · Doanh nghiệp"}</small>
              </span>
            </div>
            <div className="floating-pill">
              <span className="status-dot"></span>
              {"Phát triển bởi đội ngũ ZUKATEK"}
            </div>
            <span className="visual-caption">
              {"Minh họa hệ sinh thái ZUKATEK"}
            </span>
          </div>
        </div>
      </section>
      <div className="benefits-wrap">
        <div className="benefits">
          <div className="benefit">
            <span className="glass-icon pink">
              <svg className="icon">
                <use href="#i-users"></use>
              </svg>
            </span>
            <div>
              <h2>{"Đội ngũ phát triển"}</h2>
              <p>
                {"Tìm hiểu thành viên, kỹ năng và sản phẩm mỗi người tham gia."}
              </p>
            </div>
          </div>
          <div className="benefit">
            <span className="glass-icon orange">
              <svg className="icon">
                <use href="#i-bulb"></use>
              </svg>
            </span>
            <div>
              <h2>{"Trải nghiệm trước khi mua"}</h2>
              <p>{"Xem tính năng và dùng thử các sản phẩm có bản demo."}</p>
            </div>
          </div>
          <div className="benefit">
            <span className="glass-icon blue">
              <svg className="icon">
                <use href="#i-spark"></use>
              </svg>
            </span>
            <div>
              <h2>{"Tư vấn trực tiếp"}</h2>
              <p>
                {
                  "Liên hệ thành viên giới thiệu để được tư vấn lựa chọn sản phẩm."
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Audience({
  href,
  onAudience,
}: LinksProps & { onAudience: (audience: string) => void }) {
  return (
    <section
      className="section audience-section"
      id="about"
      aria-labelledby="about-title"
    >
      <div className="container">
        <header className="section-heading">
          <h2 id="about-title">{"Sản phẩm phù hợp với nhu cầu của bạn"}</h2>
          <p>
            {
              "Sản phẩm số cho công việc cá nhân, phối hợp trong nhóm và vận hành doanh nghiệp."
            }
          </p>
        </header>
        <div className="audience-grid">
          <article className="feature-card">
            <div className="card-art art-individual" aria-hidden="true">
              <div className="art-circle"></div>
              <div className="art-person">
                <span className="person-head"></span>
                <span className="person-body"></span>
              </div>
              <div className="idea-bubble">
                <svg className="icon">
                  <use href="#i-bulb"></use>
                </svg>
              </div>
              <div className="art-note">
                <i></i>
                <i></i>
                <i></i>
              </div>
            </div>
            <div className="feature-body">
              <h3>{"Dành cho cá nhân"}</h3>
              <p>
                {
                  "Khám phá các công cụ phục vụ công việc hằng ngày: ghi chú, sắp xếp thông tin và quản lý công việc cá nhân."
                }
              </p>
              <a
                className="text-link"
                href={href("/#contact")}
                onClick={() => onAudience("Cá nhân")}
                data-audience="Cá nhân"
              >
                {"Tư vấn cho cá nhân "}
                <svg className="icon">
                  <use href="#i-arrow"></use>
                </svg>
              </a>
            </div>
          </article>
          <article className="feature-card">
            <div className="card-art art-group" aria-hidden="true">
              <div className="art-circle"></div>
              <div className="art-person person-left">
                <span className="person-head"></span>
                <span className="person-body"></span>
              </div>
              <div className="art-person person-right">
                <span className="person-head"></span>
                <span className="person-body"></span>
              </div>
              <div className="group-link">
                <svg className="icon">
                  <use href="#i-users"></use>
                </svg>
              </div>
            </div>
            <div className="feature-body">
              <h3>{"Dành cho nhóm"}</h3>
              <p>
                {
                  "Tìm sản phẩm giúp nhóm tổ chức công việc, chia sẻ tài liệu và theo dõi tiến độ trong cùng một không gian."
                }
              </p>
              <a
                className="text-link"
                href={href("/#contact")}
                onClick={() => onAudience("Nhóm")}
                data-audience="Nhóm"
              >
                {"Tư vấn cho nhóm "}
                <svg className="icon">
                  <use href="#i-arrow"></use>
                </svg>
              </a>
            </div>
          </article>
          <article className="feature-card">
            <div className="card-art art-business" aria-hidden="true">
              <div className="art-circle"></div>
              <div className="art-building">
                <div className="building-top"></div>
                <div className="building-windows">
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                </div>
                <span></span>
              </div>
              <div className="business-bubble">
                <svg className="icon">
                  <use href="#i-spark"></use>
                </svg>
              </div>
              <div className="business-leaf"></div>
            </div>
            <div className="feature-body">
              <h3>{"Dành cho doanh nghiệp"}</h3>
              <p>
                {
                  "Xem các sản phẩm phục vụ quản lý và vận hành. Tìm hiểu tính năng, phạm vi sử dụng và chi phí trước khi mua."
                }
              </p>
              <a
                className="text-link"
                href={href("/#contact")}
                onClick={() => onAudience("Doanh nghiệp")}
                data-audience="Doanh nghiệp"
              >
                {"Tư vấn cho doanh nghiệp "}
                <svg className="icon">
                  <use href="#i-arrow"></use>
                </svg>
              </a>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export function BuyingSteps() {
  return (
    <section
      className="section collaboration-section"
      id="collaboration"
      aria-labelledby="collaboration-title"
    >
      <div className="container">
        <header className="section-heading">
          <h2 id="collaboration-title">{"Chọn mua sản phẩm ZUKATEK"}</h2>
          <p>{"Ba bước để chọn mua sản phẩm phù hợp với nhu cầu của bạn."}</p>
        </header>
        <div className="steps-grid">
          <article className="step">
            <span className="step-number">{"01"}</span>
            <h3>{"Chọn sản phẩm"}</h3>
            <p>
              {
                "Xem danh mục, tính năng và đối tượng sử dụng để tìm sản phẩm phù hợp."
              }
            </p>
          </article>
          <article className="step">
            <span className="step-number">{"02"}</span>
            <h3>{"Trải nghiệm bản demo"}</h3>
            <p>
              {
                "Mở bản trải nghiệm riêng của sản phẩm và kiểm tra các tính năng bạn cần."
              }
            </p>
          </article>
          <article className="step">
            <span className="step-number">{"03"}</span>
            <h3>{"Liên hệ mua sản phẩm"}</h3>
            <p>
              {
                "Nhận tư vấn về giá, phạm vi sử dụng và cách triển khai từ người giới thiệu hoặc ZUKATEK."
              }
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

export function FAQ() {
  return (
    <section className="section faq-section" aria-labelledby="faq-title">
      <div className="container faq-layout">
        <header className="faq-heading">
          <span className="tag">{"TÌM HIỂU THÊM"}</span>
          <h2 id="faq-title">{"Câu hỏi thường gặp"}</h2>
          <p>{"Những thông tin cần biết trước khi chọn mua sản phẩm."}</p>
        </header>
        <div className="faq-list">
          <details open>
            <summary>
              {"Sản phẩm của ZUKATEK dành cho ai?"}
              <span className="faq-plus"></span>
            </summary>
            <p>
              {
                "ZUKATEK cung cấp sản phẩm số cho cá nhân, nhóm và doanh nghiệp. Mỗi sản phẩm có đối tượng sử dụng, tính năng và phạm vi riêng để bạn lựa chọn."
              }
            </p>
          </details>
          <details>
            <summary>
              {"Tôi có thể trải nghiệm trước khi mua không?"}
              <span className="faq-plus"></span>
            </summary>
            <p>
              {
                "Sản phẩm có bản demo sẽ có nút “Trải nghiệm” mở trang riêng. Hướng dẫn dùng thử được ghi trong trang chi tiết. Hiện danh mục dùng dữ liệu mẫu và link tạm để xem bố cục."
              }
            </p>
          </details>
          <details>
            <summary>
              {"Làm thế nào để tìm hiểu kỹ năng của team?"}
              <span className="faq-plus"></span>
            </summary>
            <p>
              {
                "Mỗi thành viên có một hồ sơ riêng trong mục “Đội ngũ & kỹ năng”. Thông tin về vai trò, kỹ năng và sản phẩm đã tham gia sẽ được bổ sung tại đó."
              }
            </p>
          </details>
          <details>
            <summary>
              {"Tôi liên hệ ai để hỏi giá hoặc mua sản phẩm?"}
              <span className="faq-plus"></span>
            </summary>
            <p>
              {
                "Bạn có thể liên hệ người đã gửi hồ sơ ZUKATEK cho bạn hoặc kênh chung của ZUKATEK. Hãy cho biết sản phẩm quan tâm, số người sử dụng và nhu cầu triển khai để được tư vấn."
              }
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}

export function EmptyProducts({ href }: LinksProps) {
  return (
    <div className="product-empty" id="product-empty">
      <div className="product-empty-art" aria-hidden="true">
        <div className="empty-window">
          <div className="empty-toolbar">
            <i></i>
            <i></i>
            <i></i>
          </div>
          <div className="empty-grid">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="empty-lines">
            <i></i>
            <i></i>
          </div>
        </div>
        <span className="empty-spark">
          <svg className="icon">
            <use href="#i-spark"></use>
          </svg>
        </span>
        <span className="empty-cube"></span>
      </div>
      <div className="empty-copy">
        <span className="tag">{"HÀNH TRÌNH MỚI BẮT ĐẦU"}</span>
        <h3>
          {"Danh mục sản phẩm"}
          <br />
          {"đang được cập nhật"}
        </h3>
        <p>
          {
            "Sản phẩm được công bố sẽ có thông tin tính năng, đường dẫn trải nghiệm và thành viên phụ trách."
          }
        </p>
        <a className="text-link primary-text" href={href("/#contact")}>
          {"Nhận tư vấn sản phẩm "}
          <svg className="icon">
            <use href="#i-arrow"></use>
          </svg>
        </a>
      </div>
    </div>
  );
}

export function Footer({ href, year }: LinksProps & { year: number }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <a
              className="brand"
              href={href("/#top")}
              aria-label="ZUKATEK — về đầu trang"
            >
              <img
                src="/assets/logo.png"
                alt="ZUKATEK"
                width="1222" height="249"
                loading="lazy"
              />
            </a>
            <p>
              {"Đội ngũ phát triển sản phẩm số"}
              <br />
              {"cho cá nhân, nhóm và doanh nghiệp."}
            </p>
          </div>
          <div>
            <h3>{"Khám phá ZUKATEK"}</h3>
            <a href={href("/#about")}>{"Về ZUKATEK"}</a>
            <a href={href("/#products")}>{"Sản phẩm"}</a>
            <a href={href("/#team")}>{"Đội ngũ & kỹ năng"}</a>
          </div>
          <div>
            <h3>{"Mua & sử dụng sản phẩm"}</h3>
            <a href={href("/#collaboration")}>{"Cách mua sản phẩm"}</a>
            <a href={href("/#contact")}>{"Liên hệ"}</a>
          </div>
          <div className="footer-message">
            <h3>{"Con người đứng sau sản phẩm"}</h3>
            <p>
              {"Xem đội ngũ phát triển, kỹ năng"}
              <br />
              {"và thành viên phụ trách từng sản phẩm."}
            </p>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            {"© "}
            <span id="year">{year}</span>
            {" ZUKATEK. Cùng tiến về phía trước."}
          </span>
          <a href={href("/#top")}>
            {"Về đầu trang "}
            <svg className="icon up">
              <use href="#i-arrow"></use>
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
