(use-trait csw-trait .csw-registry.csw-trait)

(define-public (test-registry)
  ;; register smart wallets
  (let (
      (id (unwrap! (contract-call? .csw-registry csw-register .dummy-csw)
        (err "register failed")
      ))
      (owner-id (contract-call? .csw-registry get-primary-csw tx-sender))
      (id-2 (unwrap! (contract-call? .csw-registry csw-register .dummy-csw-2)
        (err "register-2 failed")
      ))
      (owner-id-2 (contract-call? .csw-registry get-primary-csw tx-sender))
    )
    (asserts! (is-eq owner-id (some id)) (err "get-primary-csw failed"))
    ;; primary csw does not change after second registration
    (asserts! (is-eq owner-id-2 (some id)) (err "get-primary-csw failed"))
    ;;
    ;; transfer nft and claim back
    (unwrap!
      (contract-call? .csw-registry transfer id tx-sender current-contract)
      (err "transfer-failed")
    )
    ;; nft belongs to this contract now
    (asserts!
      (is-eq (some current-contract)
        (unwrap! (contract-call? .csw-registry get-owner id)
          (err "get-owner-failed")
        ))
      (err "unexpected owner")
    )
    ;; csw still belongs to tx-sender
    (asserts!
      (is-eq tx-sender
        (unwrap! (contract-call? .dummy-csw get-owner) (err "get-owner-failed"))
      )
      (err "unexpected owner")
    )
    ;; transfer nft back to tx-sender
    (unwrap! (contract-call? .csw-registry claim-transfer .dummy-csw)
      (err "claim-transfer failed")
    )
    ;; nft belongs to tx-sender again
    (asserts!
      (is-eq (some tx-sender)
        (unwrap! (contract-call? .csw-registry get-owner id)
          (err "get-owner-failed")
        ))
      (err "unexpected owner")
    )
    ;;
    ;; transfer wallet
    (let ((new-owner current-contract))
      (unwrap! (contract-call? .dummy-csw transfer-wallet new-owner)
        (err "transfer-wallet failed")
      )
      ;; nft belongs to new owner
      (asserts!
        (is-eq (some new-owner)
          (unwrap! (contract-call? .csw-registry get-owner id)
            (err "get-owner-failed")
          ))
        (err "unexpected owner")
      )
    )
    (ok true)
  )
)
