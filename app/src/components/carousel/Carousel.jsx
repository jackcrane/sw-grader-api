import { useState, useRef, useEffect } from "react";
import styles from "./Carousel.module.css";
import { Play, Pause } from "@phosphor-icons/react";

export const Carousel = ({ slides = [], backgroundImage }) => {
  const wrapperRef = useRef(null);
  const videoRefs = useRef([]); // << NEW
  const [progress, setProgress] = useState({}); // << NEW

  const VIDEO_W = 1874;
  const VIDEO_H = 1256;
  const ASPECT = VIDEO_H / VIDEO_W;

  const SLIDE_GAP = 20;
  const TEXT_PARALLAX_MULTIPLIER = 2;
  const TEXT_HEIGHT = 60;

  const measure = () => {
    if (!wrapperRef.current) return;

    const usableWidth = wrapperRef.current.offsetWidth - 40;
    const videoHeight = usableWidth * ASPECT;

    setSlideHeight(videoHeight + TEXT_HEIGHT);
  };

  const [slideHeight, setSlideHeight] = useState(0);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const [index, setIndex] = useState(0);
  const anim = useRef(false);

  const goTo = (next) => {
    if (anim.current) return;
    if (next < 0 || next >= slides.length) return;

    anim.current = true;
    setTimeout(() => (anim.current = false), 700);
    setIndex(next);
  };

  const totalHeight = slides.length * (slideHeight + SLIDE_GAP);
  const videoHeight = slideHeight - TEXT_HEIGHT;

  // ---- PLAY / PAUSE HANDLER ----
  const togglePlay = (i) => {
    const v = videoRefs.current[i];
    if (!v) return;

    if (v.paused) {
      v.play();
    } else {
      v.pause();
    }
  };

  // ---- ON TIME UPDATE ----
  const handleTime = (i) => {
    const v = videoRefs.current[i];
    if (!v) return;

    const pct = (v.currentTime / v.duration) * 100;
    setProgress((p) => ({ ...p, [i]: pct }));
  };

  const startScrub = (e, i) => {
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const v = videoRefs.current[i];
    if (!v) return;

    const update = (clientX) => {
      const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      v.currentTime = v.duration * pct;
      setProgress((p) => ({ ...p, [i]: pct * 100 }));
    };

    // initial click
    update(e.clientX);

    // dragging
    const move = (ev) => update(ev.clientX);
    const stop = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  };

  const rafIds = useRef({});

  const startRaf = (i) => {
    const v = videoRefs.current[i];
    if (!v) return;

    const tick = () => {
      if (!v.paused && !v.ended) {
        const pct = (v.currentTime / v.duration) * 100;
        setProgress((p) => ({ ...p, [i]: pct }));
        rafIds.current[i] = requestAnimationFrame(tick);
      }
    };

    rafIds.current[i] = requestAnimationFrame(tick);
  };

  const stopRaf = (i) => {
    if (rafIds.current[i]) {
      cancelAnimationFrame(rafIds.current[i]);
      rafIds.current[i] = null;
    }
  };

  useEffect(() => {
    return () => {
      Object.values(rafIds.current).forEach((id) => cancelAnimationFrame(id));
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={styles.carousel}
      style={{
        backgroundImage: `url(${backgroundImage})`,
        height: slideHeight ? slideHeight + 40 : "auto",
      }}
    >
      <div
        className={styles.slides}
        style={{
          height: totalHeight,
          transform: `translateY(-${index * (slideHeight + SLIDE_GAP)}px)`,
        }}
      >
        {slides.map((slide, i) => (
          <div key={i} className={styles.slide} style={{ height: slideHeight }}>
            <div
              className={styles.text}
              style={{
                transform: `translateY(${
                  (index - i) * -(slideHeight * 0.1 * TEXT_PARALLAX_MULTIPLIER)
                }px)`,
              }}
            >
              {slide.text}
            </div>

            {/* ---- VIDEO ---- */}
            <div className={styles.videoWrapper}>
              <video
                ref={(el) => (videoRefs.current[i] = el)}
                className={styles.video}
                style={{ height: videoHeight }}
                autoPlay
                muted
                loop
                playsInline
                onTimeUpdate={() => handleTime(i)}
                onPlay={() => startRaf(i)}
                onPause={() => stopRaf(i)}
                onEnded={() => stopRaf(i)}
              >
                <source src={slide.video} />
              </video>

              {/* ---- CUSTOM OVERLAY CONTROLS ---- */}
              <div className={styles.overlayControls}>
                <div className={styles.overlayControlsControls}>
                  <button
                    className={styles.playBtn}
                    onClick={() => togglePlay(i)}
                  >
                    {videoRefs.current[i]?.paused ? (
                      <Play size={22} weight="fill" />
                    ) : (
                      <Pause size={22} weight="fill" />
                    )}
                  </button>

                  <div
                    className={styles.progressBar}
                    onMouseDown={(e) => startScrub(e, i)}
                  >
                    <div
                      className={styles.progressFill}
                      style={{ width: `${progress[i] || 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ height: SLIDE_GAP }} />
          </div>
        ))}
      </div>

      <div className={styles.pills}>
        {slides.map((_, i) => (
          <div
            key={i}
            className={`${styles.pill} ${i === index ? styles.active : ""}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <div className={styles.controls}>
        <button className={styles.controlBtn} onClick={() => goTo(index - 1)}>
          ▲
        </button>
        <button className={styles.controlBtn} onClick={() => goTo(index + 1)}>
          ▼
        </button>
      </div>
    </div>
  );
};
