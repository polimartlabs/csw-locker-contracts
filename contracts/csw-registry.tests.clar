;; ============================================
;; PROPERTY-BASED TESTS
;; ============================================

(define-public (test-register-valid-csw (csw <csw-trait>))
  (let (
      (csw-contract (contract-of csw))
    )
    (if
      (or
        ;; The csw is already registered.
        (is-some (map-get? csw-to-index csw-contract))
        ;; The tx-sender is not the owner of the csw.
        (not (is-eq (unwrap-panic (contract-call? csw get-owner)) tx-sender))
        ;; Discard invalid csw implementations.
        (not 
          (is-eq
            (contract-hash? (contract-of csw))
            (contract-hash? .smart-wallet-standard)
          )
        )
      )
      ;; Discard invalid inputs.
      (ok false)
      (let (
          (index-before (var-get csw-index))
          (has-primary-csw-before (is-some (map-get? primary-csw tx-sender)))
          (registered-index (unwrap-panic (csw-register csw)))
        )
        ;; The last index should be incremented by 1.
        (asserts! (is-eq (+ index-before u1) registered-index) (err u998))
        ;; The primary csw map should have the owner mapped to the registered
        ;; index if it didn't have one before.
        (asserts!
          (or
            has-primary-csw-before
            (is-eq
              registered-index
              (unwrap-panic (map-get? primary-csw tx-sender))
            )
          )
          (err u999)
        )
        ;; The index-to-csw and csw-to-index maps should stay consistent after
        ;; the registration.
        (try! (check-csw-index-maps-helper registered-index csw-contract))
        (ok true)
      )
    )
  )
)

(define-public (test-register-invalid-csw (csw <csw-trait>))
  (let (
      (csw-contract (contract-of csw))
    )
    (if
      (or
        ;; The csw is already registered.
        (is-some (map-get? csw-to-index csw-contract))
        ;; The tx-sender is not the owner of the csw.
        (not (is-eq (unwrap-panic (contract-call? csw get-owner)) tx-sender))
        ;; Discard valid csw implementations.
        (is-eq
          (contract-hash? (contract-of csw))
          (contract-hash? .smart-wallet-standard)
        )
      )
      ;; Discard invalid inputs.
      (ok false)
      (let (
          (index-before (var-get csw-index))
          (has-primary-csw-before (is-some (map-get? primary-csw tx-sender)))
          (register-error (unwrap-err! (csw-register csw) (err u998)))
        )
        (asserts! (is-eq (err register-error) ERR-INVALID-CSW-CONTRACT) (err u999))
        (ok true)
      )
    )
  )
)

(define-public (test-transfer (csw <csw-trait>) (recipient principal))
  (let (
      (wallet-owner (unwrap-panic (contract-call? csw get-owner)))
      (csw-contract (contract-of csw))
      (csw-index-opt (map-get? csw-to-index csw-contract))
    )
    (if
      (or
        ;; The wallet is not registered.
        (is-none csw-index-opt)
        ;; The tx-sender is not the owner of the ownership NFT.
        (not
          (is-eq
            (unwrap-panic
              (nft-get-owner? csw-ownership (unwrap-panic csw-index-opt))
            )
            tx-sender
          )
        )
        ;; The recipient is the owner of the ownership NFT.
        (is-eq
          (unwrap-panic
            (nft-get-owner? csw-ownership (unwrap-panic csw-index-opt))
          )
          recipient
        )
      )
      ;; Discard invalid inputs.
      (ok false)
      (let (
          (index (unwrap-panic csw-index-opt))
          (recipient-has-primary-before (is-some (map-get? primary-csw recipient)))
        )
        (try! (transfer index tx-sender recipient))
        ;; The ownership NFT should now be owned by the recipient.
        (asserts!
          (is-eq (unwrap-panic (nft-get-owner? csw-ownership index)) recipient)
          (err u999)
        )
        ;; The recipient's primary csw should be the index of the ownership NFT
        ;; if it didn't have one before.
        (try!
          (check-primary-csw-updated-helper
            recipient-has-primary-before
            index
            recipient
          )
        )
        ;; The index-to-csw and csw-to-index maps should stay consistent after
        ;; the claim transfer.
        (try! (check-csw-index-maps-helper index csw-contract))
        (ok true)
      )
    )
  )
)

(define-public (test-claim-transfer (csw <csw-trait>))
  (let (
      (wallet-owner (unwrap-panic (contract-call? csw get-owner)))
      (csw-contract (contract-of csw))
      (csw-index-opt (map-get? csw-to-index csw-contract))
    )
    (if
      (or
        ;; The wallet is not registered.
        (is-none csw-index-opt)
        ;; The tx-sender is not the owner of the wallet.
        (not (is-eq wallet-owner tx-sender))
        ;; The tx-sender already owns the ownership NFT.
        (is-eq
          (unwrap-panic
            (nft-get-owner? csw-ownership (unwrap! csw-index-opt (err u995)))
          )
          tx-sender
        )
      )
      ;; Discard invalid inputs.
      (ok false)
      (let (
          (claimant-has-primary-before
            (is-some (map-get? primary-csw tx-sender))
          )
          (index (unwrap-panic csw-index-opt))
        )
        (try! (claim-transfer csw))
        ;; The ownership NFT should now be owned by the tx-sender.
        (asserts!
          (is-eq (unwrap-panic (nft-get-owner? csw-ownership index)) tx-sender)
          (err u999)
        )
        ;; The tx-sender's primary csw should be the index of the ownership NFT
        ;; if it didn't have one before.
        (try!
          (check-primary-csw-updated-helper
            claimant-has-primary-before
            index
            tx-sender
          )
        )
        ;; The index-to-csw and csw-to-index maps should stay consistent after
        ;; the claim transfer.
        (try! (check-csw-index-maps-helper index csw-contract))
        (ok true)
      )
    )
  )
)

(define-public (test-set-primary-csw (csw <csw-trait>))
  (let (
      (csw-contract (contract-of csw))
      (csw-index-opt (map-get? csw-to-index csw-contract))
    )
    (if
      (or
        ;; The wallet is not registered.
        (is-none csw-index-opt)
        ;; The tx-sender is not the owner of the ownership NFT.
        (not
          (is-eq
            (unwrap-panic
              (nft-get-owner? csw-ownership (unwrap-panic csw-index-opt))
            )
            tx-sender
          )
        )
      )
      (ok false)
      (let (
          (index (unwrap-panic csw-index-opt))
        )
        (try! (set-primary-csw index))
        ;; The primary csw map should have the owner mapped to the index.
        (asserts!
          (is-eq index (unwrap-panic (map-get? primary-csw tx-sender)))
          (err u999)
        )
        ;; The index-to-csw and csw-to-index maps should stay consistent after
        ;; the set primary csw.
        (try! (check-csw-index-maps-helper index csw-contract))
        (ok true)
      )
    )  
  )
)

;; ============================================
;; PROPERTY-BASED TESTING HELPERS
;; ============================================

;; Check if the primary csw map has been updated correctly given the previous
;; state of the address and the index to check.
(define-private (check-primary-csw-updated-helper
    (has-primary-before bool)
    (index-to-check uint)
    (who principal)
  )
  (begin
    (asserts!
      (or
        has-primary-before
        (is-eq index-to-check (unwrap-panic (map-get? primary-csw who)))
      )
      (err u1000)
    )
    (ok true)
  )
)

;; Round-trip check for the index-to-csw and csw-to-index maps.
(define-private (check-csw-index-maps-helper
    (index uint)
    (csw-contract principal)
  )
  (begin
    (asserts!
      (is-eq (unwrap-panic (map-get? index-to-csw index)) csw-contract)
      (err u1001)
    )
    (asserts!
      (is-eq (unwrap-panic (map-get? csw-to-index csw-contract)) index)
      (err u1002)
    )
    (ok true)
  )
)

;; ============================================
;; INVARIANTS
;; ============================================

(define-read-only (invariant-last-csw-index-owned)
  (if
    (is-eq (var-get csw-index) u0)
    true
    (is-some (nft-get-owner? csw-ownership (var-get csw-index)))
  )
)

(define-read-only (invariant-gt-last-index-none (index uint))
  (if
    (<= index (var-get csw-index))
    true
    (is-none (map-get? index-to-csw index))
  )
)

(define-read-only (invariant-csw-index-maps-round-trip)
  (if
    (is-eq (var-get csw-index) u0)
    true
    (let (
        (csw (unwrap-panic (map-get? index-to-csw (var-get csw-index))))
        (index (unwrap-panic (map-get? csw-to-index csw)))
      )
      (is-eq index (var-get csw-index))
    )
  )
)

;; ============================================
;; INVARIANT TESTING HELPERS
;; ============================================

(define-public (transfer-last-csw-index (recipient principal))
  (transfer (var-get csw-index) tx-sender recipient)
)
