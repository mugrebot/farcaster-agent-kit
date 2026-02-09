// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CLANKNET Skills Registry
 * @notice On-chain registry for community skills with CLANKNET token staking/slashing.
 *         Creators stake CLANKNET to register skills. Governor can slash malicious skills.
 */
contract SkillsRegistry {
    IERC20 public immutable clanknetToken;

    uint256 public constant MIN_STAKE = 10_000 * 1e18; // 10,000 CLANKNET

    address public governor;

    struct Skill {
        address creator;
        uint256 stakeAmount;
        bytes32 codeHash;
        string  name;
        string  description;
        uint256 registeredAt;
        bool    active;
        bool    slashed;
    }

    mapping(bytes32 => Skill)     public skills;
    mapping(address => bytes32[]) public creatorSkillIds;
    bytes32[]                     public allSkillIds;

    event SkillRegistered(bytes32 indexed skillId, address indexed creator, string name, uint256 stake);
    event SkillRemoved(bytes32 indexed skillId, address indexed creator, uint256 stakeReturned);
    event SkillSlashed(bytes32 indexed skillId, address indexed creator, uint256 stakeSlashed, string reason);
    event GovernorTransferred(address indexed oldGovernor, address indexed newGovernor);

    constructor(address _clanknetToken, address _governor) {
        require(_clanknetToken != address(0), "Zero token");
        require(_governor != address(0), "Zero governor");
        clanknetToken = IERC20(_clanknetToken);
        governor = _governor;
    }

    modifier onlyGovernor() {
        require(msg.sender == governor, "Not governor");
        _;
    }

    // --- Core Functions ---

    function registerSkill(
        string calldata _name,
        string calldata _description,
        bytes32 _codeHash,
        uint256 _stakeAmount
    ) external returns (bytes32 skillId) {
        require(_stakeAmount >= MIN_STAKE, "Stake below minimum");
        require(bytes(_name).length > 0 && bytes(_name).length <= 64, "Invalid name length");
        require(bytes(_description).length <= 256, "Description too long");

        skillId = keccak256(abi.encodePacked(msg.sender, _name, block.timestamp));
        require(skills[skillId].creator == address(0), "Skill ID collision");

        require(clanknetToken.transferFrom(msg.sender, address(this), _stakeAmount), "Stake transfer failed");

        skills[skillId] = Skill({
            creator: msg.sender,
            stakeAmount: _stakeAmount,
            codeHash: _codeHash,
            name: _name,
            description: _description,
            registeredAt: block.timestamp,
            active: true,
            slashed: false
        });

        creatorSkillIds[msg.sender].push(skillId);
        allSkillIds.push(skillId);

        emit SkillRegistered(skillId, msg.sender, _name, _stakeAmount);
    }

    function removeSkill(bytes32 _skillId) external {
        Skill storage s = skills[_skillId];
        require(s.creator == msg.sender, "Not skill creator");
        require(s.active, "Not active");
        require(!s.slashed, "Was slashed");

        s.active = false;
        require(clanknetToken.transfer(msg.sender, s.stakeAmount), "Stake return failed");

        emit SkillRemoved(_skillId, msg.sender, s.stakeAmount);
    }

    function slashSkill(bytes32 _skillId, string calldata _reason) external onlyGovernor {
        Skill storage s = skills[_skillId];
        require(s.active, "Not active");
        require(!s.slashed, "Already slashed");

        s.active = false;
        s.slashed = true;

        uint256 amount = s.stakeAmount;
        require(clanknetToken.transfer(governor, amount), "Slash transfer failed");

        emit SkillSlashed(_skillId, s.creator, amount, _reason);
    }

    function transferGovernor(address _newGovernor) external onlyGovernor {
        require(_newGovernor != address(0), "Zero address");
        emit GovernorTransferred(governor, _newGovernor);
        governor = _newGovernor;
    }

    // --- View Functions ---

    function getSkill(bytes32 _skillId) external view returns (
        address creator, uint256 stakeAmount, bytes32 codeHash,
        string memory name, string memory description,
        uint256 registeredAt, bool active, bool slashed
    ) {
        Skill storage s = skills[_skillId];
        return (s.creator, s.stakeAmount, s.codeHash, s.name, s.description, s.registeredAt, s.active, s.slashed);
    }

    function getSkillCount() external view returns (uint256) {
        return allSkillIds.length;
    }

    function getCreatorSkills(address _creator) external view returns (bytes32[] memory) {
        return creatorSkillIds[_creator];
    }

    function getActiveSkills(uint256 _offset, uint256 _limit) external view returns (bytes32[] memory result) {
        uint256 found;
        uint256 skipped;

        // First pass: count results
        uint256 total;
        for (uint256 i; i < allSkillIds.length; i++) {
            if (skills[allSkillIds[i]].active) total++;
        }
        if (_offset >= total) return new bytes32[](0);

        uint256 size = _limit;
        if (_offset + size > total) size = total - _offset;
        result = new bytes32[](size);

        for (uint256 i; i < allSkillIds.length && found < size; i++) {
            if (skills[allSkillIds[i]].active) {
                if (skipped < _offset) { skipped++; }
                else { result[found++] = allSkillIds[i]; }
            }
        }
    }
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
