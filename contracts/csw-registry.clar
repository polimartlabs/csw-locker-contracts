;; title: csw-registry
;; version: v1
;; summary: Registry for clarity smart wallets

(define-trait csw-trait (
  (get-owner
    ()
    (response principal uint)
  )
))

;; token definition
(define-non-fungible-token csw-ownership uint)

;; errors
(define-constant ERR-UNWRAP (err u101))
(define-constant ERR-NOT-AUTHORIZED (err u102))
(define-constant ERR-NOT-LISTED (err u103))
(define-constant ERR-WRONG-COMMISSION (err u104))
(define-constant ERR-LISTED (err u105))
(define-constant ERR-NO-CSW (err u106))
(define-constant ERR-HASH-MALFORMED (err u107))
(define-constant ERR-STX-BURNT-INSUFFICIENT (err u108))
(define-constant ERR-PREORDER-NOT-FOUND (err u109))
(define-constant ERR-CHARSET-INVALID (err u110))
(define-constant ERR-NAMESPACE-ALREADY-EXISTS (err u111))
(define-constant ERR-PREORDER-CLAIMABILITY-EXPIRED (err u112))
(define-constant ERR-NAMESPACE-NOT-FOUND (err u113))
(define-constant ERR-OPERATION-UNAUTHORIZED (err u114))
(define-constant ERR-NAMESPACE-ALREADY-LAUNCHED (err u115))
(define-constant ERR-NAMESPACE-PREORDER-LAUNCHABILITY-EXPIRED (err u116))
(define-constant ERR-NAMESPACE-NOT-LAUNCHED (err u117))
(define-constant ERR-CSW-NOT-AVAILABLE (err u118))
(define-constant ERR-NAMESPACE-BLANK (err u119))
(define-constant ERR-NAME-BLANK (err u120))
(define-constant ERR-NAME-PREORDERED-BEFORE-NAMESPACE-LAUNCH (err u121))
(define-constant ERR-NAMESPACE-HAS-MANAGER (err u122))
(define-constant ERR-OVERFLOW (err u123))
(define-constant ERR-NO-CSWSPACE-MANAGER (err u124))
(define-constant ERR-FAST-MINTED-BEFORE (err u125))
(define-constant ERR-PREORDERED-BEFORE (err u126))
(define-constant ERR-NAME-NOT-CLAIMABLE-YET (err u127))
(define-constant ERR-IMPORTED-BEFORE (err u128))
(define-constant ERR-LIFETIME-EQUAL-0 (err u129))
(define-constant ERR-MIGRATION-IN-PROGRESS (err u130))
(define-constant ERR-NO-PRIMARY-NAME (err u131))

;; Counter to keep track of the last minted NFT ID, ensuring unique identifiers
(define-data-var csw-index uint u0)

;; maps

;; Define a map to link NFT IDs to their respective smart wallet.
(define-map index-to-csw
  uint
  principal
)

;; Define a map to link smart wallet to their respective NFT IDs.
(define-map csw-to-index
  principal
  uint
)

;; It maps a user's principal to the ID of their primary name.
(define-map primary-csw
  principal
  uint
)

;; read-only
(define-read-only (get-last-token-id)
  (ok (var-get csw-index))
)

;; @desc SIP-09 compliant function to get token URI
(define-read-only (get-token-uri (id uint))
  (ok none)
)

(define-read-only (get-contract-uri)
  (ok none)
)

;; @desc SIP-09 compliant function to get the owner of a specific token by its ID
(define-read-only (get-owner (id uint))
  ;; Check and return the owner of the specified NFT
  (ok (nft-get-owner? csw-ownership id))
)

;; @desc get owner function
(define-read-only (get-owner-csw (clarity-smart-wallet <csw-trait>))
  ;; Check and return the owner of the specified NFT
  (ok (nft-get-owner? csw-ownership
    (unwrap! (get-id-from-csw (contract-of clarity-smart-wallet)) ERR-NO-CSW)
  ))
)

;; Defines a read-only function to fetch the unique ID of a BNS name given its name and the namespace it belongs to.
(define-read-only (get-id-from-csw (clarity-smart-wallet principal))
  ;; Attempts to retrieve the ID from the 'csw-to-index' map using the provided name and namespace as the key.
  (map-get? csw-to-index clarity-smart-wallet)
)

;; Defines a read-only function to fetch the BNS name and the namespace given a unique ID.
(define-read-only (get-csw-from-id (id uint))
  ;; Attempts to retrieve the name and namespace from the 'index-to-csw' map using the provided id as the key.
  (map-get? index-to-csw id)
)

;; Fetcher for primary csw
(define-read-only (get-primary-csw (owner principal))
  (map-get? primary-csw owner)
)

;; Fetcher for primary csw returns clarity smart wallet
(define-read-only (get-primary (owner principal))
  (ok (get-csw-from-id (unwrap! (map-get? primary-csw owner) ERR-NO-PRIMARY-NAME)))
)

;; public functions
;; @param id: ID of the NFT being transferred.
;; @param owner: Principal of the current owner of the NFT.
;; @param recipient: Principal of the recipient of the NFT.
(define-public (transfer
    (id uint)
    (owner principal)
    (recipient principal)
  )
  (let (
      ;; Get the csw of the NFT.
      (csw (unwrap! (get-csw-from-id id) ERR-NO-CSW))
      (nft-current-owner (unwrap! (nft-get-owner? csw-ownership id) ERR-NO-CSW))
    )
    ;; Check owner and recipient is not the same
    (asserts! (not (is-eq nft-current-owner recipient))
      ERR-OPERATION-UNAUTHORIZED
    )
    ;; Check contract-caller
    (asserts!
      (or (is-eq tx-sender nft-current-owner) (is-eq contract-caller nft-current-owner))
      ERR-NOT-AUTHORIZED
    )
    ;; Check if in fact the owner is-eq to nft-current-owner
    (asserts! (is-eq owner nft-current-owner) ERR-NOT-AUTHORIZED)
    ;; Update primary csw if needed for owner
    (update-primary-csw-owner id owner)
    ;; Update primary csw if needed for recipient
    (update-primary-csw-recipient id recipient)
    ;; Execute the NFT transfer.
    (try! (nft-transfer? csw-ownership id nft-current-owner recipient))
    (print {
      topic: "transfer-csw",
      owner: recipient,
      csw: csw,
      id: id,
    })
    (ok true)
  )
)

;; @desc Sets the primary csw for the caller to a specific csw they own.
;; @param primary-csw-id: ID of the csw to be set as primary.
(define-public (set-primary-csw (primary-csw-id uint))
  (begin
    ;; Verify the contract-caller is the owner of the csw.
    (asserts!
      (is-eq (unwrap! (nft-get-owner? csw-ownership primary-csw-id) ERR-NO-CSW)
        contract-caller
      )
      ERR-NOT-AUTHORIZED
    )
    ;; Update the contract-caller's primary csw.
    (map-set primary-csw contract-caller primary-csw-id)
    ;; Return true upon successful execution.
    (ok true)
  )
)

;; @desc registration function: (csw-register)
;; @param: clarity-smart-wallet (csw-trait): the clarity smart wallet to be registered.
(define-public (csw-register (clarity-smart-wallet <csw-trait>))
  (let (
      ;; Calculates the ID for the new csw to be minted.
      (id-to-be-minted (+ (var-get csw-index) u1))
      (csw (contract-of clarity-smart-wallet))
      (csw-id (map-get? csw-to-index csw))
      (owner (unwrap! (contract-call? clarity-smart-wallet get-owner) ERR-UNWRAP))
    )
    ;; Ensure the csw is not already registered.
    (asserts! (is-none csw-id) ERR-CSW-NOT-AVAILABLE)
    (asserts! (or (is-eq owner tx-sender) (is-eq owner contract-caller))
      ERR-NOT-AUTHORIZED
    )
    ;; Update the index
    (var-set csw-index id-to-be-minted)
    (map-set csw-to-index csw id-to-be-minted)
    (map-set index-to-csw id-to-be-minted csw)
    ;; Update primary csw if needed for owner
    (update-primary-csw-recipient id-to-be-minted owner)
    ;; Mints the new csw NFT.
    (try! (nft-mint? csw-ownership id-to-be-minted owner))
    ;; Log the new csw registration
    (print {
      topic: "new-csw",
      owner: owner,
      csw: csw,
      id: id-to-be-minted,
    })
    ;; Signals successful completion.
    (ok id-to-be-minted)
  )
)

;; This function is similar to the 'transfer' function but does not check that the owner is the contract-caller.
;; @param id: the id of the nft being transferred.
;; @param owner: the principal of the current owner of the nft being transferred.
;; @param recipient: the principal of the recipient to whom the nft is being transferred.
(define-public (claim-transfer (clarity-smart-wallet <csw-trait>))
  (let (
      ;; Attempts to retrieve the name and namespace associated with the given NFT ID.
      (id (unwrap! (map-get? csw-to-index (contract-of clarity-smart-wallet))
        ERR-NO-CSW
      ))
      (owner (unwrap! (nft-get-owner? csw-ownership id) ERR-NO-CSW))
      (recipient (unwrap! (contract-call? clarity-smart-wallet get-owner) ERR-UNWRAP))
    )
    (asserts! (or (is-eq recipient tx-sender) (is-eq recipient contract-caller))
      ERR-NOT-AUTHORIZED
    )
    ;; Update primary name if needed for owner
    (update-primary-csw-owner id owner)
    ;; Update primary name if needed for recipient
    (update-primary-csw-recipient id recipient)
    ;; Executes the NFT transfer from the current owner to the recipient.
    (try! (nft-transfer? csw-ownership id owner recipient))
    (print {
      topic: "transfer-csw",
      owner: recipient,
      csw: clarity-smart-wallet,
      id: id,
    })
    (ok true)
  )
)

;; Private function to update the primary name of an address when transfering a name
;; If the id is = to the primary name then it means that a transfer is happening and we should delete it
(define-private (update-primary-csw-owner
    (id uint)
    (owner principal)
  )
  ;; Check if the owner is transferring the primary name
  (if (is-eq (map-get? primary-csw owner) (some id))
    ;; If it is, then delete the primary name map
    (map-delete primary-csw owner)
    ;; If it is not, do nothing, keep the current primary name
    false
  )
)

;; Private function to update the primary name of an address when recieving
(define-private (update-primary-csw-recipient
    (id uint)
    (recipient principal)
  )
  ;; Check if recipient has a primary name
  (match (map-get? primary-csw recipient)
    recipient-primary-csw
    ;; If recipient has a primary name do nothing
    true
    ;; If recipient doesn't have a primary name
    (map-set primary-csw recipient id)
  )
)
