import { describe, expect, it, beforeEach } from "vitest";
import { Buffer } from "node:buffer";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface PartMetadata {
  serial: string;
  authHash: Buffer;
  manufacturer: string;
  model: string;
  description: string;
  timestamp: number;
}

interface PartRevision {
  updatedHash: Buffer;
  updateNotes: string;
  timestamp: number;
}

interface PartCertification {
  certType: string;
  expiry: number;
  details: string;
  active: boolean;
}

interface PartWarranty {
  duration: number;
  terms: string;
  startTime: number;
  provider: string;
}

interface SupplyChainLog {
  actor: string;
  action: string;
  timestamp: number;
  location: string | null;
}

interface TransferRestrictions {
  restricted: boolean;
  allowedTransferees: string[];
}

interface ContractState {
  partsNftOwners: Map<number, string>;
  partMetadata: Map<number, PartMetadata>;
  partRevisions: Map<string, PartRevision>;
  partCertifications: Map<string, PartCertification>;
  partWarranties: Map<number, PartWarranty>;
  supplyChainLogs: Map<string, SupplyChainLog>;
  transferRestrictions: Map<number, TransferRestrictions>;
  nextPartId: number;
  contractOwner: string;
}

// Mock contract implementation
class PartsNFTMock {
  private state: ContractState = {
    partsNftOwners: new Map(),
    partMetadata: new Map(),
    partRevisions: new Map(),
    partCertifications: new Map(),
    partWarranties: new Map(),
    supplyChainLogs: new Map(),
    transferRestrictions: new Map(),
    nextPartId: 1,
    contractOwner: "deployer",
  };

  private ERR_NOT_AUTHORIZED = 100;
  private ERR_INVALID_ID = 101;
  private ERR_ALREADY_EXISTS = 102;
  private ERR_NOT_OWNER = 103;
  private ERR_INVALID_REVISION = 104;
  private ERR_TRANSFER_RESTRICTED = 106;
  private ERR_MAX_LOGS_REACHED = 108;
  private ERR_INVALID_INPUT = 109;
  private MAX_REVISIONS = 10;
  private MAX_LOGS_PER_PART = 50;
  private MAX_SERIAL_LENGTH = 64;
  private MAX_MODEL_LENGTH = 64;
  private MAX_DESCRIPTION_LENGTH = 500;
  private MAX_CERT_TYPE_LENGTH = 32;
  private MAX_DETAILS_LENGTH = 200;
  private MAX_ACTION_LENGTH = 64;
  private MAX_LOCATION_LENGTH = 128;
  private MAX_TERMS_LENGTH = 300;
  private MAX_NOTES_LENGTH = 200;
  private MAX_HASH_LENGTH = 32;

  private currentBlockHeight = 1000;

  mintPart(
    caller: string,
    serial: string,
    authHash: Buffer,
    model: string,
    description: string
  ): ClarityResponse<number> {
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    const partId = this.state.nextPartId;
    if (this.state.partMetadata.has(partId)) {
      return { ok: false, value: this.ERR_ALREADY_EXISTS };
    }
    if (
      serial.length > this.MAX_SERIAL_LENGTH ||
      model.length > this.MAX_MODEL_LENGTH ||
      description.length > this.MAX_DESCRIPTION_LENGTH ||
      authHash.length !== this.MAX_HASH_LENGTH
    ) {
      return { ok: false, value: this.ERR_INVALID_INPUT };
    }
    this.state.partsNftOwners.set(partId, caller);
    this.state.partMetadata.set(partId, {
      serial,
      authHash,
      manufacturer: caller,
      model,
      description,
      timestamp: this.currentBlockHeight,
    });
    this.state.nextPartId += 1;
    return { ok: true, value: partId };
  }

  addRevision(
    caller: string,
    partId: number,
    revision: number,
    updatedHash: Buffer,
    notes: string
  ): ClarityResponse<boolean> {
    const metadata = this.state.partMetadata.get(partId);
    if (!metadata) {
      return { ok: false, value: this.ERR_INVALID_ID };
    }
    if (caller !== metadata.manufacturer) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (revision >= this.MAX_REVISIONS) {
      return { ok: false, value: this.ERR_INVALID_REVISION };
    }
    const key = `${partId}-${revision}`;
    if (this.state.partRevisions.has(key)) {
      return { ok: false, value: this.ERR_ALREADY_EXISTS };
    }
    if (notes.length > this.MAX_NOTES_LENGTH || updatedHash.length !== this.MAX_HASH_LENGTH) {
      return { ok: false, value: this.ERR_INVALID_INPUT };
    }
    this.state.partRevisions.set(key, {
      updatedHash,
      updateNotes: notes,
      timestamp: this.currentBlockHeight,
    });
    return { ok: true, value: true };
  }

  certifyPart(
    caller: string,
    partId: number,
    certType: string,
    expiry: number,
    details: string
  ): ClarityResponse<boolean> {
    const metadata = this.state.partMetadata.get(partId);
    if (!metadata) {
      return { ok: false, value: this.ERR_INVALID_ID };
    }
    if (caller !== metadata.manufacturer) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (certType.length > this.MAX_CERT_TYPE_LENGTH || details.length > this.MAX_DETAILS_LENGTH) {
      return { ok: false, value: this.ERR_INVALID_INPUT };
    }
    const key = `${partId}-${caller}`;
    this.state.partCertifications.set(key, {
      certType,
      expiry,
      details,
      active: true,
    });
    return { ok: true, value: true };
  }

  addWarranty(
    caller: string,
    partId: number,
    duration: number,
    terms: string
  ): ClarityResponse<boolean> {
    const metadata = this.state.partMetadata.get(partId);
    if (!metadata) {
      return { ok: false, value: this.ERR_INVALID_ID };
    }
    if (caller !== metadata.manufacturer) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (terms.length > this.MAX_TERMS_LENGTH) {
      return { ok: false, value: this.ERR_INVALID_INPUT };
    }
    this.state.partWarranties.set(partId, {
      duration,
      terms,
      startTime: this.currentBlockHeight,
      provider: caller,
    });
    return { ok: true, value: true };
  }

  logSupplyChain(
    caller: string,
    partId: number,
    action: string,
    location: string | null
  ): ClarityResponse<boolean> {
    const metadata = this.state.partMetadata.get(partId);
    if (!metadata) {
      return { ok: false, value: this.ERR_INVALID_ID };
    }
    const owner = this.state.partsNftOwners.get(partId);
    if (caller !== owner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    const logs = Array.from(this.state.supplyChainLogs.keys()).filter((k) =>
      k.startsWith(`${partId}-`)
    );
    if (logs.length >= this.MAX_LOGS_PER_PART) {
      return { ok: false, value: this.ERR_MAX_LOGS_REACHED };
    }
    if (action.length > this.MAX_ACTION_LENGTH || (location && location.length > this.MAX_LOCATION_LENGTH)) {
      return { ok: false, value: this.ERR_INVALID_INPUT };
    }
    const nextLogIndex = logs.length + 1;
    const key = `${partId}-${nextLogIndex}`;
    this.state.supplyChainLogs.set(key, {
      actor: caller,
      action,
      timestamp: this.currentBlockHeight,
      location,
    });
    return { ok: true, value: true };
  }

  setTransferRestriction(
    caller: string,
    partId: number,
    restricted: boolean,
    allowed: string[]
  ): ClarityResponse<boolean> {
    const owner = this.state.partsNftOwners.get(partId);
    if (!owner || caller !== owner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    this.state.transferRestrictions.set(partId, {
      restricted,
      allowedTransferees: allowed,
    });
    return { ok: true, value: true };
  }

  transferPart(
    caller: string,
    partId: number,
    recipient: string
  ): ClarityResponse<boolean> {
    const owner = this.state.partsNftOwners.get(partId);
    if (!owner || caller !== owner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    const restrictions = this.state.transferRestrictions.get(partId);
    if (restrictions && restrictions.restricted) {
      if (!restrictions.allowedTransferees.includes(recipient)) {
        return { ok: false, value: this.ERR_TRANSFER_RESTRICTED };
      }
    }
    this.state.partsNftOwners.set(partId, recipient);
    return { ok: true, value: true };
  }

  getPartMetadata(partId: number): ClarityResponse<PartMetadata | null> {
    return { ok: true, value: this.state.partMetadata.get(partId) ?? null };
  }

  getPartRevision(
    partId: number,
    revision: number
  ): ClarityResponse<PartRevision | null> {
    const key = `${partId}-${revision}`;
    return { ok: true, value: this.state.partRevisions.get(key) ?? null };
  }

  getPartCertification(
    partId: number,
    certifier: string
  ): ClarityResponse<PartCertification | null> {
    const key = `${partId}-${certifier}`;
    return { ok: true, value: this.state.partCertifications.get(key) ?? null };
  }

  getPartWarranty(partId: number): ClarityResponse<PartWarranty | null> {
    return { ok: true, value: this.state.partWarranties.get(partId) ?? null };
  }

  getSupplyChainLog(
    partId: number,
    logIndex: number
  ): ClarityResponse<SupplyChainLog | null> {
    const key = `${partId}-${logIndex}`;
    return { ok: true, value: this.state.supplyChainLogs.get(key) ?? null };
  }

  getTransferRestrictions(
    partId: number
  ): ClarityResponse<TransferRestrictions | null> {
    return { ok: true, value: this.state.transferRestrictions.get(partId) ?? null };
  }

  verifyPartAuthenticity(
    partId: number,
    providedHash: Buffer
  ): ClarityResponse<boolean> {
    const metadata = this.state.partMetadata.get(partId);
    if (!metadata) {
      return { ok: false, value: this.ERR_INVALID_ID };
    }
    if (providedHash.length !== this.MAX_HASH_LENGTH) {
      return { ok: false, value: this.ERR_INVALID_INPUT };
    }
    return {
      ok: metadata.authHash.equals(providedHash),
      value: metadata.authHash.equals(providedHash) ? true : this.ERR_NOT_AUTHORIZED,
    };
  }

  isWarrantyActive(partId: number): ClarityResponse<boolean> {
    const warranty = this.state.partWarranties.get(partId);
    if (!warranty) {
      return { ok: true, value: false };
    }
    return { ok: true, value: this.currentBlockHeight <= warranty.startTime + warranty.duration };
  }

  getOwner(partId: number): ClarityResponse<string | null> {
    return { ok: true, value: this.state.partsNftOwners.get(partId) ?? null };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  manufacturer: "manufacturer",
  user1: "user1",
  user2: "user2",
};

describe("PartsNFT Contract", () => {
  let contract: PartsNFTMock;

  beforeEach(() => {
    contract = new PartsNFTMock();
  });

  it("should allow owner to mint a new part", () => {
    const authHash = Buffer.from("a".repeat(32));
    const mintResult = contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );
    expect(mintResult).toEqual({ ok: true, value: 1 });

    const metadata = contract.getPartMetadata(1);
    expect(metadata.ok).toBe(true);
    expect(metadata.value).toEqual(
      expect.objectContaining({
        serial: "serial123",
        authHash,
        model: "modelX",
      })
    );
  });

  it("should reject invalid auth hash length during mint", () => {
    const invalidHash = Buffer.from("a".repeat(33));
    const mintResult = contract.mintPart(
      accounts.deployer,
      "serial123",
      invalidHash,
      "modelX",
      "Test description"
    );
    expect(mintResult).toEqual({ ok: false, value: 109 });
  });

  it("should prevent non-owner from minting", () => {
    const authHash = Buffer.from("a".repeat(32));
    const mintResult = contract.mintPart(
      accounts.user1,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );
    expect(mintResult).toEqual({ ok: false, value: 100 });
  });

  it("should reject invalid input lengths during mint", () => {
    const authHash = Buffer.from("a".repeat(32));
    const longSerial = "a".repeat(65);
    const mintResult = contract.mintPart(
      accounts.deployer,
      longSerial,
      authHash,
      "modelX",
      "Test description"
    );
    expect(mintResult).toEqual({ ok: false, value: 109 });
  });

  it("should allow manufacturer to add revision", () => {
    const authHash = Buffer.from("a".repeat(32));
    contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );

    const updatedHash = Buffer.from("b".repeat(32));
    const addRevisionResult = contract.addRevision(
      accounts.deployer,
      1,
      1,
      updatedHash,
      "Revision notes"
    );
    expect(addRevisionResult).toEqual({ ok: true, value: true });

    const revision = contract.getPartRevision(1, 1);
    expect(revision.ok).toBe(true);
    expect(revision.value).toEqual(
      expect.objectContaining({ updatedHash, updateNotes: "Revision notes" })
    );
  });

  it("should reject invalid updated hash length in revision", () => {
    const authHash = Buffer.from("a".repeat(32));
    contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );

    const invalidHash = Buffer.from("b".repeat(33));
    const addRevisionResult = contract.addRevision(
      accounts.deployer,
      1,
      1,
      invalidHash,
      "Revision notes"
    );
    expect(addRevisionResult).toEqual({ ok: false, value: 109 });
  });

  it("should reject invalid revision notes length", () => {
    const authHash = Buffer.from("a".repeat(32));
    contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );

    const updatedHash = Buffer.from("b".repeat(32));
    const longNotes = "a".repeat(201);
    const addRevisionResult = contract.addRevision(
      accounts.deployer,
      1,
      1,
      updatedHash,
      longNotes
    );
    expect(addRevisionResult).toEqual({ ok: false, value: 109 });
  });

  it("should allow certifying a part", () => {
    const authHash = Buffer.from("a".repeat(32));
    contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );

    const certifyResult = contract.certifyPart(
      accounts.deployer,
      1,
      "ISO9001",
      100000,
      "Certified details"
    );
    expect(certifyResult).toEqual({ ok: true, value: true });

    const cert = contract.getPartCertification(1, accounts.deployer);
    expect(cert.ok).toBe(true);
    expect(cert.value).toEqual(
      expect.objectContaining({ certType: "ISO9001", active: true })
    );
  });

  it("should reject invalid certification details length", () => {
    const authHash = Buffer.from("a".repeat(32));
    contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );

    const longDetails = "a".repeat(201);
    const certifyResult = contract.certifyPart(
      accounts.deployer,
      1,
      "ISO9001",
      100000,
      longDetails
    );
    expect(certifyResult).toEqual({ ok: false, value: 109 });
  });

  it("should allow adding warranty", () => {
    const authHash = Buffer.from("a".repeat(32));
    contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );

    const warrantyResult = contract.addWarranty(
      accounts.deployer,
      1,
      365,
      "1 year warranty"
    );
    expect(warrantyResult).toEqual({ ok: true, value: true });

    const warranty = contract.getPartWarranty(1);
    expect(warranty.ok).toBe(true);
    expect(warranty.value).toEqual(
      expect.objectContaining({ duration: 365, terms: "1 year warranty" })
    );
  });

  it("should reject invalid warranty terms length", () => {
    const authHash = Buffer.from("a".repeat(32));
    contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );

    const longTerms = "a".repeat(301);
    const warrantyResult = contract.addWarranty(
      accounts.deployer,
      1,
      365,
      longTerms
    );
    expect(warrantyResult).toEqual({ ok: false, value: 109 });
  });

  it("should log supply chain events", () => {
    const authHash = Buffer.from("a".repeat(32));
    contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );

    const logResult = contract.logSupplyChain(
      accounts.deployer,
      1,
      "Shipped",
      "Warehouse A"
    );
    expect(logResult).toEqual({ ok: true, value: true });

    const log = contract.getSupplyChainLog(1, 1);
    expect(log.ok).toBe(true);
    expect(log.value).toEqual(
      expect.objectContaining({ action: "Shipped", location: "Warehouse A" })
    );
  });

  it("should reject invalid supply chain action length", () => {
    const authHash = Buffer.from("a".repeat(32));
    contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );

    const longAction = "a".repeat(65);
    const logResult = contract.logSupplyChain(
      accounts.deployer,
      1,
      longAction,
      "Warehouse A"
    );
    expect(logResult).toEqual({ ok: false, value: 109 });
  });

  it("should enforce transfer restrictions", () => {
    const authHash = Buffer.from("a".repeat(32));
    contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );

    const setRestrictionResult = contract.setTransferRestriction(
      accounts.deployer,
      1,
      true,
      [accounts.user1]
    );
    expect(setRestrictionResult).toEqual({ ok: true, value: true });

    const transferFail = contract.transferPart(accounts.deployer, 1, accounts.user2);
    expect(transferFail).toEqual({ ok: false, value: 106 });

    const transferSuccess = contract.transferPart(accounts.deployer, 1, accounts.user1);
    expect(transferSuccess).toEqual({ ok: true, value: true });

    const owner = contract.getOwner(1);
    expect(owner).toEqual({ ok: true, value: accounts.user1 });
  });

  it("should verify part authenticity", () => {
    const authHash = Buffer.from("a".repeat(32));
    contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );

    const verifySuccess = contract.verifyPartAuthenticity(1, authHash);
    expect(verifySuccess).toEqual({ ok: true, value: true });

    const wrongHash = Buffer.from("b".repeat(32));
    const verifyFail = contract.verifyPartAuthenticity(1, wrongHash);
    expect(verifyFail).toEqual({ ok: false, value: 100 });

    const invalidHash = Buffer.from("c".repeat(33));
    const verifyInvalid = contract.verifyPartAuthenticity(1, invalidHash);
    expect(verifyInvalid).toEqual({ ok: false, value: 109 });
  });

  it("should check if warranty is active", () => {
    const authHash = Buffer.from("a".repeat(32));
    contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );

    contract.addWarranty(accounts.deployer, 1, 365, "1 year");

    const isActive = contract.isWarrantyActive(1);
    expect(isActive).toEqual({ ok: true, value: true });
  });

  it("should handle max log limit", () => {
    const authHash = Buffer.from("a".repeat(32));
    contract.mintPart(
      accounts.deployer,
      "serial123",
      authHash,
      "modelX",
      "Test description"
    );

    for (let i = 1; i <= 50; i++) {
      const logResult = contract.logSupplyChain(
        accounts.deployer,
        1,
        `Action${i}`,
        `Location${i}`
      );
      expect(logResult).toEqual({ ok: true, value: true });
    }

    const logResult = contract.logSupplyChain(
      accounts.deployer,
      1,
      "Action51",
      "Location51"
    );
    expect(logResult).toEqual({ ok: false, value: 108 });
  });
});