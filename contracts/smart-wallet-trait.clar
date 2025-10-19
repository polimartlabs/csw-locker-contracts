;; title: smart-wallet-trait
;; version:
;; summary:
;; description:

(use-trait extension-trait 'ST3FFRX7C911PZP5RHE148YDVDD9JWVS6FZRA60VS.extension-trait.extension-trait)

(define-trait smart-wallet-trait (
  (extension-call
    (<extension-trait> (buff 2048))
    (response bool uint)
  )
))
