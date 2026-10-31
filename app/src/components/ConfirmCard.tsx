import { AnimatePresence, motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { answerConfirm, useMimo } from "../lib/store";

// Shown whenever the agent wants to do something risky. Nothing happens
// until the user clicks; no answer within a minute counts as "no".
export function ConfirmCard() {
  const confirm = useMimo((s) => s.confirm);
  return (
    <AnimatePresence>
      {confirm && (
        <motion.div
          className="confirm-card"
          role="alertdialog"
          aria-labelledby="confirm-title"
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
        >
          <ShieldAlert size={26} strokeWidth={2.5} aria-hidden />
          <div>
            <h3 id="confirm-title">MIMO needs your OK</h3>
            <p>{confirm.details}</p>
          </div>
          <div className="confirm-actions">
            <button className="btn-secondary btn-sm" onClick={() => answerConfirm(false)} autoFocus>
              No, don't
            </button>
            <button className="btn-primary btn-danger btn-sm" onClick={() => answerConfirm(true)}>
              Yes, do it
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
