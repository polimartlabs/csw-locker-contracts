(use-trait csw-trait .csw-registry.csw-trait)

(define-public (test-registry)
  ;; register smart wallets
  (let (
      (id (unwrap! (contract-call? .csw-registry csw-register .smart-wallet-standard)
        (err "register failed 1")
      ))
      (owner-id (contract-call? .csw-registry get-primary-csw tx-sender))
      (id-2 (unwrap!
        (contract-call? .csw-registry csw-register .smart-wallet-standard-2)
        (err "register failed 2")
      ))
      (owner-id-2 (contract-call? .csw-registry get-primary-csw tx-sender))
    )
    (asserts! (is-eq owner-id (some id)) (err "get-primary-csw failed 1"))
    ;; primary csw does not change after second registration
    (asserts! (is-eq owner-id-2 (some id)) (err "get-primary-csw failed 2"))
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
      (err "unexpected owner 1")
    )
    ;; csw still belongs to tx-sender
    (asserts!
      (is-eq tx-sender
        (unwrap! (contract-call? .smart-wallet-standard get-owner)
          (err "get-owner-failed")
        ))
      (err "unexpected owner 2")
    )
    ;; transfer nft back to tx-sender
    (unwrap! (contract-call? .csw-registry claim-transfer .smart-wallet-standard)
      (err "claim-transfer failed")
    )
    ;; nft belongs to tx-sender again
    (asserts!
      (is-eq (some tx-sender)
        (unwrap! (contract-call? .csw-registry get-owner id)
          (err "get-owner-failed")
        ))
      (err "unexpected owner 3")
    )
    ;;
    ;; transfer wallet
    (let (
        (new-wallet-owner current-contract)
        (prev-nft-owner tx-sender)
      )
      (unwrap!
        (contract-call? .smart-wallet-standard transfer-wallet new-wallet-owner)
        (err "transfer-wallet failed")
      )
      ;; nft belongs to prvious owner
      (asserts!
        (is-eq (some prev-nft-owner)
          (unwrap! (contract-call? .csw-registry get-owner id)
            (err "get-owner-failed")
          ))
        (err "unexpected owner 4")
      )
    )
    (ok true)
  )
)
