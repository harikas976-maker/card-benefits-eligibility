$ErrorActionPreference = 'Stop'

$auditPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.audit'
if (Test-Path -LiteralPath $auditPath) {
    throw "The audit path already exists. Verify its permissions before use. This script only configures a new directory."
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
New-Item -ItemType Directory -Path $auditPath | Out-Null
$acl = Get-Acl -LiteralPath $auditPath
$acl.SetAccessRuleProtection($true, $false)
foreach ($rule in $acl.Access) {
    $acl.RemoveAccessRuleSpecific($rule)
}
$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
    $identity.User, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow'
))
Set-Acl -LiteralPath $auditPath -AclObject $acl

$verified = Get-Acl -LiteralPath $auditPath
$rules = @($verified.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
if (!$verified.AreAccessRulesProtected -or $rules.Count -ne 1 -or
    $rules[0].IdentityReference.Value -ne $identity.User.Value -or
    $rules[0].AccessControlType -ne 'Allow' -or
    $rules[0].InheritanceFlags -ne 'ContainerInherit, ObjectInherit') {
    throw "Audit permissions did not pass verification. Review the directory ACL before starting the API."
}

Write-Output "Verified audit access is restricted to $($identity.Name) at $auditPath"
