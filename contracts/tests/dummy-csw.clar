(impl-trait .csw-registry.csw-trait)
(define-data-var csw-owner principal tx-sender)

(define-public (get-owner)
  (ok (var-get csw-owner))
)

(define-public (transfer-wallet (new-owner principal))
  (let ((id (unwrap! (contract-call? .csw-registry get-id-from-csw current-contract)
      (err u99999)
    )))
    ;; change ownership of csw
    (var-set csw-owner new-owner)
    (contract-call? .csw-registry transfer id tx-sender new-owner)
  )
)
