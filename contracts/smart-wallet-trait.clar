;; title: smart-wallet-trait
;; version:
;; summary:
;; description:

(use-trait extension-trait 'ST3FFRX7C911PZP5RHE148YDVDD9JWVS6FZRA60VS.extension-trait.extension-trait)

(define-trait smart-wallet-trait (
  (extension-call
    (
      ;; Extension contract.
      <extension-trait>
      ;; Serialized extension call payload.
      (buff 2048)
      ;; Optional authentication ID.
      (optional uint)
      ;; Optional signature.
      (optional (buff 64))
    )
    (response bool uint)
  )
))
